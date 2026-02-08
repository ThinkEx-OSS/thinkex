import { logger } from "@/lib/utils/logger";

export interface FirecrawlScrapeResponse {
    success: boolean;
    data?: {
        content?: string;
        markdown?: string;
        metadata?: {
            title?: string;
            description?: string;
            language?: string;
            sourceURL?: string;
            [key: string]: any;
        };
    };
    error?: string;
}

export class FirecrawlClient {
    private apiKey: string;
    private baseUrl = "https://api.firecrawl.dev/v1";

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.FIRECRAWL_API_KEY || "";
        if (!this.apiKey) {
            logger.warn("⚠️ [Firecrawl] No API key provided. Firecrawl features will be disabled.");
        }
    }

    /**
     * Scrape a single URL using Firecrawl
     */
    async scrapeUrl(url: string): Promise<FirecrawlScrapeResponse> {
        if (!this.apiKey) {
            return { success: false, error: "Firecrawl API key not configured" };
        }

        try {
            logger.debug(`🔥 [Firecrawl] Scraping URL: ${url}`);

            const response = await fetch(`${this.baseUrl}/scrape`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    url,
                    formats: ["markdown"],
                    onlyMainContent: true,
                    waitFor: 1000, // Wait for dynamic content
                }),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    return { success: false, error: "Invalid Firecrawl API key" };
                }
                if (response.status === 429) {
                    return { success: false, error: "Firecrawl rate limit exceeded" };
                }
                const errorText = await response.text();
                throw new Error(`Firecrawl API error: ${response.status} ${errorText}`);
            }

            const result = await response.json();

            if (!result.success) {
                return { success: false, error: result.error || "Unknown Firecrawl error" };
            }

            return {
                success: true,
                data: result.data,
            };
        } catch (error: any) {
            logger.error(`❌ [Firecrawl] Error scraping ${url}:`, error);
            return {
                success: false,
                error: error.message || String(error),
            };
        }
    }
}
