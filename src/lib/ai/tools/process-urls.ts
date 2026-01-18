import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";

/**
 * Create the processUrls tool for analyzing web pages
 */
export function createProcessUrlsTool() {
    return {
        description: "Analyze web pages using Google's URL Context API. Extracts content, key information, and metadata from regular web URLs (http/https). Use this for web pages, articles, documentation, and other web content. For files (PDFs, images, documents) or videos, use the processFiles tool instead.",
        inputSchema: z.object({
            jsonInput: z.string().describe("JSON string containing an object with 'urls' (array of web URLs). Example: '{\"urls\": [\"https://example.com\"]}'"),
        }),
        execute: async ({ jsonInput }: { jsonInput: string }) => {
            let parsed;
            try {
                parsed = JSON.parse(jsonInput);
            } catch (e) {
                logger.error("❌ [URL_TOOL] Failed to parse JSON input:", e);
                return "Error: Input must be a valid JSON string.";
            }

            const urlList = parsed.urls || [];

            logger.debug("🔗 [URL_TOOL] Processing web URLs:", urlList);

            if (!urlList || urlList.length === 0) {
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
                const tools: any = {
                    url_context: google.tools.urlContext({}),
                };

                const promptText = `Analyze the content from the following URL${urlList.length > 1 ? 's' : ''}:
${urlList.map((url: string, i: number) => `${i + 1}. ${url}`).join('\n')}

Please provide:
- What each URL/page is about
- Key information, features, specifications, or data
- Important details relevant to the user's question
- Publication dates or last updated information

Provide a clear, accurate answer based on the URL content.`;

                const { text, sources, providerMetadata } = await generateText({
                    model: google("gemini-2.5-flash"),
                    tools,
                    prompt: promptText,
                });

                const urlMetadata = providerMetadata?.urlContext?.urlMetadata || null;
                const groundingChunks = providerMetadata?.urlContext?.groundingChunks || null;

                return {
                    text,
                    metadata: {
                        urlMetadata: Array.isArray(urlMetadata) ? (urlMetadata as Array<{ retrievedUrl: string; urlRetrievalStatus: string }>) : null,
                        groundingChunks: Array.isArray(groundingChunks) ? (groundingChunks as Array<any>) : null,
                        sources: Array.isArray(sources) ? (sources as Array<any>) : null,
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
    };
}
