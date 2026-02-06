import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { load } from "cheerio";
import { logger } from "@/lib/utils/logger";

export interface UrlContent {
  url: string;
  title: string;
  content: string;
  success: boolean;
  error?: string;
  source?: "google-context" | "direct-fetch";
}

/**
 * Shared utility to process URLs.
 * Strategies:
 * 1. Google URL Context (Official/Smart)
 * 2. Direct fetch with browser impersonation (Fallback/Robust)
 */
export class UrlProcessor {
  /**
   * Attempts to fetch URL content using Google's URL Context API tool
   */
  private static async tryGoogleContextFetch(url: string): Promise<UrlContent | null> {
    try {
      logger.debug(`🌐 [UrlProcessor] Trying Google Context for: ${url}`);

      const { text } = await generateText({
        model: google("gemini-2.5-flash-lite"), // Use lite model for speed
        tools: {
          urlContext: google.tools.urlContext({}) as any,
        },
        // @ts-ignore
        maxSteps: 2,
        prompt: `Please read the content of the following URL: ${url}
        
        If you can assume the content, extract the main title and the full text content of the page.
        Do not summarize wildly, just provide the content as accurately as possible.
        
        Return the result in this format:
        Title: [Title]
        Content: [Content]`,
      });

      // Simple parsing of the returned text
      const titleMatch = text.match(/Title:\s*(.*?)(\n|$)/);
      const contentMatch = text.match(/Content:\s*([\s\S]*)/);

      if (!titleMatch || !contentMatch) {
        // If structured parse fails, just use the whole text if it seems like content
        if (text.length > 50) {
          return {
            url,
            title: url, // Fallback title
            content: text,
            success: true,
            source: "google-context"
          }
        }
        return null;
      }

      return {
        url,
        title: titleMatch[1].trim(),
        content: contentMatch[1].trim(),
        success: true,
        source: "google-context",
      };

    } catch (error) {
      logger.warn(`⚠️ [UrlProcessor] Google Context failed for ${url}:`, error);
      return null;
    }
  }

  /**
   * Fetches and parses content from a URL, handling bot detection.
   */
  static async processUrl(url: string): Promise<UrlContent> {
    logger.debug(`🌐 [UrlProcessor] Processing URL: ${url}`);

    // Strategy 1: Google URL Context
    const googleResult = await this.tryGoogleContextFetch(url);
    if (googleResult && googleResult.success && googleResult.content.length > 100) {
      logger.debug(`✅ [UrlProcessor] Google Context success for ${url}`);
      return googleResult;
    }

    // Strategy 2: Direct Fetch (Fallback)
    logger.debug(`🔄 [UrlProcessor] Falling back to Direct Fetch for ${url}`);

    try {
      // 1. Try fetching with a browser-like User-Agent
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // 2. Parse HTML with Cheerio
      const $ = load(html);

      // Remove script, style, and irrelevant tags
      $('script, style, noscript, iframe, svg, header, footer, nav').remove();

      // Extract title
      const title = $('title').text().trim() || url;

      // Extract main content
      // Prioritize common content containers if they exist
      let content = '';
      const contentSelectors = ['main', 'article', '#content', '.content', '.post', '.article'];

      for (const selector of contentSelectors) {
        if ($(selector).length > 0) {
          content = $(selector).text().trim();
          break;
        }
      }

      // If specific container not found or empty, get body text
      if (!content) {
        content = $('body').text().trim();
      }

      // Clean up whitespace (normalize newlines and spaces)
      content = content.replace(/\s+/g, ' ').trim();

      // Basic truncation if extremely long (e.g. > 100k chars) to avoid context limit issues
      // though typically the LLM call handles truncation, it's good to be safe.
      if (content.length > 50000) {
        content = content.substring(0, 50000) + "... [Truncated]";
      }

      if (!content) {
        throw new Error("No readable text content found");
      }

      logger.debug(`✅ [UrlProcessor] Successfully fetched ${url} (${content.length} chars)`);

      return {
        url,
        title,
        content,
        success: true,
        source: "direct-fetch",
      };

    } catch (error: any) {
      logger.error(`❌ [UrlProcessor] Failed to process ${url}:`, error);
      return {
        url,
        title: url,
        content: "",
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Process multiple URLs in parallel
   */
  static async processUrls(urls: string[]): Promise<UrlContent[]> {
    return Promise.all(urls.map(url => this.processUrl(url)));
  }
}
