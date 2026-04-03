import { logger } from "@/lib/utils/logger";

const DEFAULT_SCRAPE_OPTIONS = {
    formats: ["markdown"],
    onlyMainContent: true,
    waitFor: 1000,
};

const BATCH_POLL_INTERVAL_MS = 1500;
const BATCH_POLL_TIMEOUT_MS = 45000;

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

export interface FirecrawlDocument {
    content?: string;
    markdown?: string;
    metadata?: FirecrawlMetadata;
}

export interface FirecrawlPageResult {
    url: string;
    title: string;
    content: string;
    success: boolean;
    error?: string;
    metadata?: FirecrawlMetadata;
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

    private async pollBatchScrape(jobId: string, urls: string[]): Promise<FirecrawlPageResult[]> {
        const startedAt = Date.now();

        while (Date.now() - startedAt < BATCH_POLL_TIMEOUT_MS) {
            const response = await fetch(`${this.baseUrl}/batch/scrape/${jobId}`, {
                method: "GET",
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                throw new Error(await this.parseErrorResponse(response));
            }

            const result = await response.json();
            if (result?.status === "completed" && Array.isArray(result?.data)) {
                return this.normalizeBatchResults(urls, result.data);
            }

            if (result?.status === "failed") {
                throw new Error(
                    typeof result?.error === "string"
                        ? result.error
                        : "Firecrawl batch scrape failed",
                );
            }

            await new Promise((resolve) => setTimeout(resolve, BATCH_POLL_INTERVAL_MS));
        }

        throw new Error("Firecrawl batch scrape timed out");
    }

    private normalizeBatchResults(urls: string[], documents: unknown[]): FirecrawlPageResult[] {
        const unusedDocuments = [...documents];
        const bySourceUrl = new Map<string, unknown>();

        for (const document of documents) {
            if (!document || typeof document !== "object" || Array.isArray(document)) {
                continue;
            }

            const metadata =
                "metadata" in document && document.metadata && typeof document.metadata === "object" && !Array.isArray(document.metadata)
                    ? (document.metadata as FirecrawlMetadata)
                    : undefined;

            const sourceUrl =
                typeof metadata?.sourceURL === "string"
                    ? metadata.sourceURL
                    : typeof metadata?.url === "string"
                        ? metadata.url
                        : undefined;

            if (sourceUrl && !bySourceUrl.has(sourceUrl)) {
                bySourceUrl.set(sourceUrl, document);
            }
        }

        return urls.map((url, index) => {
            const matched = bySourceUrl.get(url);
            if (matched) {
                return this.normalizePageResult(url, matched);
            }

            const fallback = unusedDocuments[index];
            return fallback
                ? this.normalizePageResult(url, fallback)
                : {
                    url,
                    title: url,
                    content: "",
                    success: false,
                    error: "No result returned for URL",
                };
        });
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

        try {
            logger.debug(`🔥 [Firecrawl] Batch scraping ${urls.length} URLs`);

            const response = await fetch(`${this.baseUrl}/batch/scrape`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    urls,
                    ...DEFAULT_SCRAPE_OPTIONS,
                }),
            });

            if (!response.ok) {
                const error = await this.parseErrorResponse(response);
                return urls.map((url) => ({
                    url,
                    title: url,
                    content: "",
                    success: false,
                    error,
                }));
            }

            const result = await response.json();

            if (Array.isArray(result?.data)) {
                return this.normalizeBatchResults(urls, result.data);
            }

            if (typeof result?.id === "string") {
                return await this.pollBatchScrape(result.id, urls);
            }

            throw new Error("Unexpected Firecrawl batch scrape response");
        } catch (error) {
            logger.error("❌ [Firecrawl] Error batch scraping URLs:", error);
            const message = error instanceof Error ? error.message : String(error);
            return urls.map((url) => ({
                url,
                title: url,
                content: "",
                success: false,
                error: message,
            }));
        }
    }
}
