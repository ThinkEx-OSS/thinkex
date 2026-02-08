import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { logger } from "@/lib/utils/logger";
import { FirecrawlClient } from "@/lib/ai/utils/firecrawl";

export interface UrlContent {
  url: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
  source?: "google-context" | "firecrawl" | "google-grounding";
}

// Scraping Mode Configuration
type ScrapingMode = "hybrid" | "firecrawl-only" | "google-only" | "direct-only";

function getScrapingMode(): ScrapingMode {
  const mode = process.env.SCRAPING_MODE?.toLowerCase();

  // If explicitly set, respect it
  if (mode === "firecrawl-only") return "firecrawl-only";
  if (mode === "google-only") return "google-only";
  if (mode === "direct-only") return "direct-only";

  // Default to hybrid
  return "hybrid";
}

/**
 * STRATEGY INTERFACE
 */
interface ScrapingStrategy {
  name: string;
  process(url: string): Promise<UrlContent | null>;
}

/**
 * STRATEGY 1: Google URL Context (Official/Smart)
 */
class GoogleContextStrategy implements ScrapingStrategy {
  name = "google-context";

  async process(url: string): Promise<UrlContent | null> {
    try {
      logger.debug(`🌐 [Scraper:Google] Trying URL Context for: ${url}`);

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      try {
        const result = await generateText({
          model: google("gemini-2.5-flash"),
          tools: {
            urlContext: google.tools.urlContext({}) as any,
          },
          // @ts-ignore - maxToolRoundtrips is valid but missing from current type defs
          maxToolRoundtrips: 2,
          prompt: `Please read the content of the following URL: ${url}
        
        If you can assume the content, extract the main title and the full text content of the page.
        Do not summarize wildly, just provide the content as accurately as possible.
        
        Return the result in this format:
        Title: [Title]
        Content: [Content]`,
          abortSignal: controller.signal,
        });

        clearTimeout(timeoutId);

        const { text } = result;

        // --- DEBUG LOGGING ---
        logger.debug(`🔍 [Scraper:Google] Response received:`, {
          textLength: text?.length || 0,
          textPreview: text?.substring(0, 200) || '(empty)',
          hasText: !!text,
        });

        // --- SIMPLIFED VALIDATION ---

        // --- SIMPLIFED VALIDATION ---

        // 1. Check if we actually got text back
        if (!text || text.trim().length === 0) {
          logger.warn(`⚠️ [Scraper:Google] No text returned.`);
          return null; // Fallback to Firecrawl
        }

        // 2. Check for common "Access Denied" or "Unable to read" phrases from LLM
        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("i cannot access") ||
          lowerText.includes("i am unable to read") ||
          lowerText.includes("access is denied") ||
          lowerText.includes("403 forbidden")
        ) {
          logger.warn(`⚠️ [Scraper:Google] LLM reported access failure.`);
          return null; // Fallback to Firecrawl
        }

        // If we passed checks, we assume success.
        // Try to parse title/content if possible, or just use whole text.
        const titleMatch = text.match(/Title:\s*(.*?)(\n|$)/);
        const contentMatch = text.match(/Content:\s*([\s\S]*)/);

        let title = url;
        let content = text;

        if (titleMatch && contentMatch) {
          title = titleMatch[1].trim();
          content = contentMatch[1].trim();
        }

        return {
          url,
          title,
          content,
          success: true,
          source: "google-context",
        };
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
          logger.warn(`⏱️ [Scraper:Google] Timeout after 15s for ${url}`);
          return null;
        }
        throw error; // Re-throw non-timeout errors
      }

    } catch (error) {
      logger.error(`❌ [Scraper:Google] Exception caught for ${url}:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }
}

/**
 * STRATEGY 2: Firecrawl (Robust/Stealth/Dynamic)
 */
class FirecrawlStrategy implements ScrapingStrategy {
  name = "firecrawl";
  private client: FirecrawlClient;

  constructor() {
    this.client = new FirecrawlClient();
  }

  async process(url: string): Promise<UrlContent | null> {
    try {
      // Check if configured
      if (!process.env.FIRECRAWL_API_KEY) {
        logger.debug("⚠️ [Scraper:Firecrawl] Skipped: No API key provided");
        return null;
      }

      logger.debug(`🔥 [Scraper:Firecrawl] Scraping URL: ${url}`);

      const result = await this.client.scrapeUrl(url);

      if (!result.success || !result.data) {
        logger.warn(`⚠️ [Scraper:Firecrawl] Failed: ${result.error}`);
        return null;
      }

      // Prefer robust metadata, fall back to simple props
      const title = result.data.metadata?.title || result.data.metadata?.ogTitle || url;
      const content = result.data.markdown || result.data.content || "";

      if (!content) return null;

      return {
        url,
        title,
        content,
        success: true,
        source: "firecrawl",
      };

    } catch (error) {
      logger.error(`❌ [Scraper:Firecrawl] Error:`, error);
      return null;
    }
  }
}

/**
 * STRATEGY 3: Google Grounding (Search Fallback)
 * If we can't read the page directly, just ask Google what it's about.
 */
class GoogleGroundingStrategy implements ScrapingStrategy {
  name = "google-grounding";

  async process(url: string): Promise<UrlContent | null> {
    try {
      logger.debug(`🔍 [Scraper:Grounding] Falling back to Search for: ${url}`);

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        tools: {
          googleSearch: google.tools.googleSearch({}),
        },
        // @ts-ignore - maxToolRoundtrips is valid but missing from current type defs
        maxToolRoundtrips: 2,
        prompt: `Find information about this specific URL: ${url}
        
        Provide a detailed summary of the content found on this page. 
        Focus on the main topics, key points, and purpose of the page.
        
        Format the output as:
        Title: [Page Title]
        Content: [Detailed Summary]`,
      });

      // Flexible parsing
      const titleMatch = text.match(/Title:\s*(.*?)(\n|$)/);
      const contentMatch = text.match(/Content:\s*([\s\S]*)/);

      const title = titleMatch ? titleMatch[1].trim() : url;
      let content = contentMatch ? contentMatch[1].trim() : text;

      if (content.length < 50) return null;

      return {
        url,
        title,
        content,
        success: true,
        source: "google-grounding",
      };

    } catch (error) {
      logger.error(`❌ [Scraper:Grounding] Error:`, error);
      return null;
    }
  }
}

/**
 * Shared utility to process URLs uses Strategy Pattern
 */
export class UrlProcessor {

  static async processUrl(url: string): Promise<UrlContent> {
    const mode = getScrapingMode();
    logger.debug(`🌐 [UrlProcessor] Processing ${url} (Mode: ${mode})`);

    // Define strategies
    const strategies: ScrapingStrategy[] = [];

    // --- STRATEGY SELECTION LOGIC ---

    if (mode === "firecrawl-only") {
      strategies.push(new FirecrawlStrategy());
    } else if (mode === "google-only") {
      strategies.push(new GoogleContextStrategy());
      strategies.push(new GoogleGroundingStrategy()); // Add grounding as backup even in google-only
    } else {
      // HYBRID (Default)

      // 1. Google Context (Best for "Reading" specific pages)
      strategies.push(new GoogleContextStrategy());

      // 2. Firecrawl (Best for "Accessing" blocked/JS pages)
      if (process.env.FIRECRAWL_API_KEY) {
        strategies.push(new FirecrawlStrategy());
      }

      // 3. Google Grounding (Absolute "Last Resort" - Search for the page info)
      strategies.push(new GoogleGroundingStrategy());
    }

    // --- EXECUTION LOOP ---

    for (const strategy of strategies) {
      const result = await strategy.process(url);
      if (result && result.success) {
        logger.debug(`✅ [UrlProcessor] Success via ${strategy.name}`);
        return result;
      }
    }

    // --- FINAL FAILURE ---

    logger.error(`❌ [UrlProcessor] All strategies failed for ${url}`);
    return {
      url,
      title: url,
      content: "",
      success: false,
      error: `Failed to fetch content using strategies: ${strategies.map(s => s.name).join(', ')}`,
    };
  }

  /**
   * Process multiple URLs in parallel with graceful partial failure handling
   */
  static async processUrls(urls: string[]): Promise<UrlContent[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.processUrl(url))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Log the error but return a failed UrlContent object
        logger.error(`❌ [UrlProcessor] Failed to process URL ${urls[index]}:`, result.reason);
        return {
          url: urls[index],
          title: urls[index],
          content: '',
          success: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });
  }
}
