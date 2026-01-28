import { google } from "@ai-sdk/google";
import { generateText, tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

/**
 * Create the processUrls tool for analyzing web pages
 */
export function createProcessUrlsTool() {
    return tool({
        description: "Analyze web pages using Google's URL Context API. Extracts content, key information, and metadata from regular web URLs (http/https). Use this for web pages, articles, documentation, and other web content. For files (PDFs, images, documents) or videos, use the processFiles tool instead.",
        inputSchema: zodSchema(
            z.object({
                jsonInput: z.string().describe("JSON string containing an object with 'urls' (array of web URLs). Example: '{\"urls\": [\"https://example.com\"]}'"),
            })
        ),
        execute: async ({ jsonInput }) => {
            let parsed;
            try {
                parsed = JSON.parse(jsonInput);
            } catch (e) {
                logger.error("❌ [URL_TOOL] Failed to parse JSON input:", e);
                return "Error: Input must be a valid JSON string.";
            }

            // Validate parsed JSON shape
            if (typeof parsed !== 'object' || parsed === null) {
                return "Error: Input must be a JSON object with 'urls' array.";
            }

            const urlList = parsed.urls;

            if (!Array.isArray(urlList)) {
                return "Error: 'urls' must be an array.";
            }

            // Validate all items are strings
            if (!urlList.every((url: unknown) => typeof url === 'string')) {
                return "Error: All URLs must be strings.";
            }

            logger.debug("🔗 [URL_TOOL] Processing web URLs:", urlList);

            if (urlList.length === 0) {
                return "No URLs provided";
            }

            if (urlList.length > 20) {
                return `Too many URLs (${urlList.length}). Maximum 20 URLs allowed.`;
            }

            const fileUrls = urlList.filter((url: string) =>
                url.includes('supabase.co/storage') ||
                url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)
            );

            if (fileUrls.length > 0) {
                logger.warn("🔗 [URL_TOOL] File/video URLs detected, suggesting processFiles tool:", fileUrls);
                return `Error: This tool only handles web URLs. Please use the processFiles tool for file URLs (${fileUrls.join(', ')})`;
            }

            try {
                // Process multiple URLs in parallel using separate generateText calls
                const urlProcessingPromises = urlList.map(async (url: string) => {
                    const tools: any = {
                        url_context: google.tools.urlContext({}),
                    };

                    const promptText = `Analyze the content from the following URL:
${url}

Please provide:
- What this URL/page is about
- Key information, features, specifications, or data
- Important details relevant to the user's question
- Publication dates or last updated information

Provide a clear, accurate answer based on the URL content.`;

                    try {
                        const { text, sources, providerMetadata } = await generateText({
                            model: google("gemini-2.5-flash"),
                            tools,
                            prompt: promptText,
                        });

                        const urlMetadata = providerMetadata?.urlContext?.urlMetadata || null;
                        const groundingChunks = providerMetadata?.urlContext?.groundingChunks || null;

                        return {
                            url,
                            success: true,
                            text,
                            metadata: {
                                urlMetadata: Array.isArray(urlMetadata) ? (urlMetadata as Array<{ retrievedUrl: string; urlRetrievalStatus: string }>) : null,
                                groundingChunks: Array.isArray(groundingChunks) ? (groundingChunks as Array<any>) : null,
                                sources: Array.isArray(sources) ? (sources as Array<any>) : null,
                            },
                        };
                    } catch (urlError) {
                        logger.error(`🔗 [URL_TOOL] Error processing URL ${url}:`, {
                            error: urlError instanceof Error ? urlError.message : String(urlError),
                        });
                        return {
                            url,
                            success: false,
                            text: `Error processing ${url}: ${urlError instanceof Error ? urlError.message : String(urlError)}`,
                            metadata: {
                                urlMetadata: null,
                                groundingChunks: null,
                                sources: null,
                            },
                        };
                    }
                });

                // Execute all URL processing in parallel
                const results = await Promise.all(urlProcessingPromises);

                // Aggregate results
                const successfulResults = results.filter(r => r.success);
                const failedResults = results.filter(r => !r.success);

                // Combine text from all successful results
                const combinedText = results
                    .map(r => `**${r.url}**\n\n${r.text}`)
                    .join('\n\n---\n\n');

                // Combine metadata from all results
                const allUrlMetadata = results
                    .flatMap(r => r.metadata.urlMetadata || [])
                    .filter((m): m is { retrievedUrl: string; urlRetrievalStatus: string } => m !== null);
                const allGroundingChunks = results
                    .flatMap(r => r.metadata.groundingChunks || [])
                    .filter((c): c is any => c !== null);
                const allSources = results
                    .flatMap(r => r.metadata.sources || [])
                    .filter((s): s is any => s !== null);

                if (failedResults.length > 0) {
                    logger.warn(`🔗 [URL_TOOL] ${failedResults.length} URL(s) failed to process:`, failedResults.map(r => r.url));
                }

                return {
                    text: combinedText,
                    metadata: {
                        urlMetadata: allUrlMetadata.length > 0 ? allUrlMetadata : null,
                        groundingChunks: allGroundingChunks.length > 0 ? allGroundingChunks : null,
                        sources: allSources.length > 0 ? allSources : null,
                    },
                };
            } catch (error) {
                logger.error("🔗 [URL_TOOL] Error processing web URLs:", {
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error instanceof Error ? error.constructor.name : typeof error,
                    errorStack: error instanceof Error ? error.stack : undefined,
                    urls: urlList,
                    fullError: error,
                });
                return {
                    text: `Error processing web URLs: ${error instanceof Error ? error.message : String(error)}`,
                    metadata: {
                        urlMetadata: null,
                        groundingChunks: null,
                        sources: null,
                    },
                };
            }
        },
    });
}
