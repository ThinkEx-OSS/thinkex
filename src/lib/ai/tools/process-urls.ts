import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import {
    ProcessUrlsInputSchema,
    ProcessUrlsOutputSchema,
    type ProcessUrlsOutput,
} from "@/lib/ai/process-urls-shared";
import { FirecrawlClient } from "@/lib/ai/utils/firecrawl";

const MAX_CONTENT_CHARS_PER_URL = 12000;

function truncateContent(content: string): string {
    if (content.length <= MAX_CONTENT_CHARS_PER_URL) {
        return content;
    }

    return `${content.slice(0, MAX_CONTENT_CHARS_PER_URL).trim()}\n\n[Content truncated for length]`;
}

/**
 * Create the web_fetch tool for analyzing web pages
 */
export function createProcessUrlsTool() {
    return tool({
        description: "Fetch the content of web pages from the provided URLs. Use this for web pages, articles, and documentation when the model needs the actual page text before answering. This tool does not handle uploaded files or video URLs.",
        inputSchema: zodSchema(ProcessUrlsInputSchema),
        outputSchema: zodSchema(ProcessUrlsOutputSchema),
        strict: true,
        execute: async ({ urls: urlList }): Promise<ProcessUrlsOutput | string> => {
            logger.debug("🔗 [URL_TOOL] Processing web URLs:", urlList);

            const fileUrls = urlList.filter((url: string) =>
                url.includes('supabase.co/storage') ||
                url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)
            );

            if (fileUrls.length > 0) {
                logger.warn("🔗 [URL_TOOL] File/video URLs detected for web URL tool:", fileUrls);
                return {
                    text: `Error: This tool only handles regular web URLs, not uploaded files or video URLs (${fileUrls.join(", ")})`,
                    metadata: {
                        urlMetadata: urlList.map((url) => ({
                            retrievedUrl: url,
                            urlRetrievalStatus: fileUrls.includes(url)
                                ? "URL_RETRIEVAL_STATUS_UNSUPPORTED"
                                : "URL_RETRIEVAL_STATUS_SKIPPED",
                        })),
                        sources: null,
                    },
                };
            }

            try {
                const client = new FirecrawlClient();
                const scrapedResults = (await client.scrapeUrls(urlList)).map((result) => ({
                    ...result,
                    content: truncateContent(result.content),
                    success: result.success && result.content.length > 0,
                }));

                const successfulResults = scrapedResults.filter((result) => result.success);
                const failedResults = scrapedResults.filter((result) => !result.success);

                if (failedResults.length > 0) {
                    logger.warn(
                        `🔗 [URL_TOOL] ${failedResults.length} URL(s) failed to process:`,
                        failedResults.map((result) => result.url),
                    );
                }

                if (successfulResults.length === 0) {
                    return {
                        text: `Failed to process any of the provided URLs. Errors: ${failedResults.map((result) => `${result.url}: ${result.error || "Unknown error"}`).join("; ")}`,
                        metadata: {
                            urlMetadata: scrapedResults.map((result) => ({
                                retrievedUrl: result.url,
                                urlRetrievalStatus: result.success
                                    ? "URL_RETRIEVAL_STATUS_SUCCESS"
                                    : "URL_RETRIEVAL_STATUS_FAILED",
                            })),
                            sources: null,
                        },
                    };
                }

                const combinedText = successfulResults
                    .map((result) => `# ${result.title}\nURL: ${result.url}\n\n${result.content}`)
                    .join("\n\n---\n\n");

                return {
                    text: combinedText,
                    metadata: {
                        urlMetadata: scrapedResults.map((result) => ({
                            retrievedUrl: result.url,
                            urlRetrievalStatus: result.success
                                ? "URL_RETRIEVAL_STATUS_SUCCESS"
                                : "URL_RETRIEVAL_STATUS_FAILED",
                        })),
                        sources: successfulResults.map(({ url, title }) => ({ uri: url, title })),
                    },
                };

            } catch (error) {
                logger.error("🔗 [URL_TOOL] Error processing web URLs:", {
                    error: error instanceof Error ? error.message : String(error),
                    urls: urlList,
                });
                return {
                    text: `Error processing web URLs: ${error instanceof Error ? error.message : String(error)}`,
                    metadata: {
                        urlMetadata: null,
                        sources: null,
                    },
                };
            }
        },
    });
}
