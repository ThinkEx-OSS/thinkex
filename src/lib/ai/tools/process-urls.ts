import { google, type GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { generateText, tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { ProcessUrlsInputSchema } from "@/lib/ai/process-urls-shared";

/**
 * Create the processUrls tool for analyzing web pages
 */


/**
 * Create the processUrls tool for analyzing web pages
 */
export function createProcessUrlsTool() {
    return tool({
        description: "Analyze web pages using Google's URL Context API. Extracts content, key information, and metadata from regular web URLs (http/https). Use this for web pages, articles, documentation, and other web content. This tool does not handle uploaded files or videos.",
        inputSchema: zodSchema(ProcessUrlsInputSchema),
        strict: true,
        execute: async ({ urls: urlList, instruction }) => {
            logger.debug("🔗 [URL_TOOL] Processing web URLs:", urlList);

            const fileUrls = urlList.filter((url: string) =>
                url.includes('supabase.co/storage') ||
                url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/)
            );

            if (fileUrls.length > 0) {
                logger.warn("🔗 [URL_TOOL] File/video URLs detected for web URL tool:", fileUrls);
                return `Error: This tool only handles regular web URLs, not uploaded files or video URLs (${fileUrls.join(', ')})`;
            }

            try {
                const urlsBlock = urlList.map((url, index) => `${index + 1}. ${url}`).join("\n");
                const instructionBlock = instruction?.trim()
                    ? `Focus instruction: ${instruction.trim()}\n\n`
                    : "";

                const { text, providerMetadata } = await generateText({
                    model: google("gemini-3-flash-preview"),
                    tools: {
                        url_context: google.tools.urlContext({}),
                    },
                    prompt: `${instructionBlock}Analyze these URLs directly using URL context:

${urlsBlock}

Provide a clear, accurate answer in this format:
Summary: [1-2 sentences]
Key information:
- [Point 1]
- [Point 2]
- [Additional points as needed]
Details: [Important details, specs, dates, or relevant factual context]`,
                });

                const googleMetadata = providerMetadata?.google as GoogleGenerativeAIProviderMetadata | undefined;
                const groundingMetadata = googleMetadata?.groundingMetadata ?? null;
                const urlContextMetadata = googleMetadata?.urlContextMetadata ?? null;
                const groundingChunks = groundingMetadata?.groundingChunks ?? null;
                const sources = groundingChunks
                    ?.flatMap((chunk) => {
                        const uri = chunk.web?.uri;
                        if (!uri) return [];

                        return [{
                            uri,
                            title: chunk.web?.title || uri,
                        }];
                    })
                    .filter((source, index, array) =>
                        array.findIndex((candidate) => candidate.uri === source.uri) === index
                    ) ?? null;

                return {
                    text,
                    metadata: {
                        urlMetadata: urlContextMetadata?.urlMetadata ?? null,
                        groundingChunks,
                        sources,
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
                        groundingChunks: null,
                        sources: null,
                    },
                };
            }
        },
    });
}
