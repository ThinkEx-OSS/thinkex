import { logger } from "@/lib/utils/logger";

const DEFAULT_SCRAPE_OPTIONS = {
    formats: ["markdown"],
    onlyMainContent: true,
    waitFor: 1000,
};

export interface FirecrawlMetadata {
    title?: string | string[];
    description?: string | string[];
    language?: string | string[] | null;
    sourceURL?: string;
    url?: string;
    statusCode?: number;
    error?: string | null;
    [key: string]: unknown;
}

export interface FirecrawlPageResult {
    url: string;
    title: string;
    content: string;
    success: boolean;
    error?: string;
    metadata?: FirecrawlMetadata;
}

export interface FirecrawlMapResult {
    success: boolean;
    links: Array<{ url: string; title?: string; description?: string }>;
    error?: string;
}

export interface FirecrawlMapOptions {
    search?: string;
    limit?: number;
    includeSubdomains?: boolean;
    sitemap?: "include" | "skip" | "only";
}

export class FirecrawlClient {
    private apiKey: string;
    private baseUrl = "https://api.firecrawl.dev/v2";

    constructor(apiKey?: string) {
        this.apiKey = apiKey || process.env.FIRECRAWL_API_KEY || "";
        if (!this.apiKey) {
            logger.warn("⚠️ [Firecrawl] No API key provided. Firecrawl features will be disabled.");
        }
    }

    private getHeaders() {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
        };
    }

    private async parseErrorResponse(response: Response): Promise<string> {
        if (response.status === 401) {
            return "Invalid Firecrawl API key";
        }

        if (response.status === 429) {
            return "Firecrawl rate limit exceeded";
        }

        try {
            const errorText = await response.text();
            if (!errorText.trim()) {
                return `Firecrawl API error: ${response.status}`;
            }

            const errorJson = JSON.parse(errorText);
            if (typeof errorJson?.error === "string") {
                return errorJson.error;
            }

            return `Firecrawl API error: ${response.status} ${errorText}`;
        } catch {
            // Fall through to generic status message if the body is unreadable or not JSON.
        }

        return `Firecrawl API error: ${response.status}`;
    }

    private firstString(value: unknown): string | undefined {
        if (typeof value === "string") {
            return value;
        }

        if (Array.isArray(value)) {
            const first = value.find((item) => typeof item === "string");
            return typeof first === "string" ? first : undefined;
        }

        return undefined;
    }

    private normalizePageResult(url: string, document: unknown): FirecrawlPageResult {
        if (!document || typeof document !== "object" || Array.isArray(document)) {
            return {
                url,
                title: url,
                content: "",
                success: false,
                error: "Invalid Firecrawl response",
            };
        }

        const record = document as {
            markdown?: unknown;
            content?: unknown;
            metadata?: unknown;
        };

        const metadata =
            record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
                ? (record.metadata as FirecrawlMetadata)
                : undefined;

        const content =
            typeof record.markdown === "string"
                ? record.markdown
                : typeof record.content === "string"
                    ? record.content
                    : "";

        const metadataError =
            typeof metadata?.error === "string" && metadata.error.trim().length > 0
                ? metadata.error
                : undefined;

        return {
            url,
            title:
                this.firstString(metadata?.title) ??
                this.firstString(metadata?.description) ??
                metadata?.sourceURL ??
                url,
            content,
            success: !metadataError && content.trim().length > 0,
            error: metadataError ?? (content.trim().length === 0 ? "No content returned" : undefined),
            metadata,
        };
    }

    async scrapeUrl(url: string): Promise<FirecrawlPageResult> {
        if (!this.apiKey) {
            return {
                url,
                title: url,
                content: "",
                success: false,
                error: "Firecrawl API key not configured",
            };
        }

        try {
            logger.debug(`🔥 [Firecrawl] Scraping URL: ${url}`);

            const response = await fetch(`${this.baseUrl}/scrape`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    url,
                    ...DEFAULT_SCRAPE_OPTIONS,
                }),
            });

            if (!response.ok) {
                return {
                    url,
                    title: url,
                    content: "",
                    success: false,
                    error: await this.parseErrorResponse(response),
                };
            }

            const result = await response.json();
            if (result?.success === false) {
                return {
                    url,
                    title: url,
                    content: "",
                    success: false,
                    error: typeof result?.error === "string" ? result.error : "Unknown Firecrawl error",
                };
            }

            return this.normalizePageResult(url, result?.data);
        } catch (error) {
            logger.error(`❌ [Firecrawl] Error scraping ${url}:`, error);
            return {
                url,
                title: url,
                content: "",
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async scrapeUrls(urls: string[]): Promise<FirecrawlPageResult[]> {
        if (urls.length === 0) {
            return [];
        }

        if (!this.apiKey) {
            return urls.map((url) => ({
                url,
                title: url,
                content: "",
                success: false,
                error: "Firecrawl API key not configured",
            }));
        }

        if (urls.length === 1) {
            return [await this.scrapeUrl(urls[0])];
        }

        logger.debug(`🔥 [Firecrawl] Scraping ${urls.length} URLs in parallel`);
        return await Promise.all(urls.map((url) => this.scrapeUrl(url)));
    }

    async mapUrl(
        url: string,
        options: FirecrawlMapOptions = {},
    ): Promise<FirecrawlMapResult> {
        if (!this.apiKey) {
            return {
                success: false,
                links: [],
                error: "Firecrawl API key not configured",
            };
        }

        try {
            logger.debug(`🔥 [Firecrawl] Mapping URL: ${url}`);

            const body: Record<string, unknown> = { url };
            if (options.search !== undefined) body.search = options.search;
            if (options.limit !== undefined) body.limit = options.limit;
            if (options.includeSubdomains !== undefined) {
                body.includeSubdomains = options.includeSubdomains;
            }
            if (options.sitemap !== undefined) body.sitemap = options.sitemap;

            const response = await fetch(`${this.baseUrl}/map`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                return {
                    success: false,
                    links: [],
                    error: await this.parseErrorResponse(response),
                };
            }

            const result = await response.json();
            if (result?.success === false) {
                return {
                    success: false,
                    links: [],
                    error:
                        typeof result?.error === "string"
                            ? result.error
                            : "Unknown Firecrawl map error",
                };
            }

            const rawLinks = Array.isArray(result?.links) ? result.links : [];
            const links = rawLinks
                .map((entry: unknown) => {
                    if (typeof entry === "string") {
                        return entry.length > 0 ? { url: entry } : null;
                    }
                    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
                        const rec = entry as {
                            url?: unknown;
                            title?: unknown;
                            description?: unknown;
                        };
                        if (typeof rec.url !== "string" || rec.url.length === 0) {
                            return null;
                        }
                        return {
                            url: rec.url,
                            title: typeof rec.title === "string" ? rec.title : undefined,
                            description:
                                typeof rec.description === "string"
                                    ? rec.description
                                    : undefined,
                        };
                    }
                    return null;
                })
                .filter(
                    (
                        link: { url: string; title?: string; description?: string } | null,
                    ): link is { url: string; title?: string; description?: string } =>
                        link !== null,
                );

            return { success: true, links };
        } catch (error) {
            logger.error(`❌ [Firecrawl] Error mapping ${url}:`, error);
            return {
                success: false,
                links: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
