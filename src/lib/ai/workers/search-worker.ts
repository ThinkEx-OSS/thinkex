import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import type { GoogleGenerativeAIProviderMetadata } from "@ai-sdk/google";
import { logger } from "@/lib/utils/logger";

/**
 * WORKER 1: Search Agent
 * Uses Google Search Grounding to find current information with sources
 */
export async function searchWorker(query: string): Promise<string> {
    try {
        logger.debug("🔍 [SEARCH-WORKER] Starting search for:", query);

        const { text, sources, providerMetadata } = await generateText({
            model: google("gemini-2.5-pro"),
            tools: {
                google_search: google.tools.googleSearch({}),
            },
            prompt: `Search for information about: ${query}

Provide a comprehensive answer based on the search results. Include relevant details and context from the sources.`,
        });

        // Access grounding metadata for additional context
        const metadata = providerMetadata?.vertex as GoogleGenerativeAIProviderMetadata | undefined;
        const groundingMetadata = metadata?.groundingMetadata;

        logger.debug("🔍 [SEARCH-WORKER] Search completed", {
            hasGroundingMetadata: !!groundingMetadata,
            webSearchQueries: groundingMetadata?.webSearchQueries?.length || 0,
            groundingSupports: groundingMetadata?.groundingSupports?.length || 0,
        });

        // Enhanced response with source information
        let enhancedResponse = text;

        // Add sources information if available
        if (sources && sources.length > 0) {
            enhancedResponse += "\n\n**Sources:**\n";
            sources.forEach((source, index) => {
                // Check if source has a URL property (for web sources)
                // Google grounding sources may have different structures
                const sourceUrl = 'url' in source ? (source as any).url :
                    'id' in source && typeof source.id === 'string' && source.id.startsWith('http') ? source.id :
                        undefined;

                if (sourceUrl) {
                    enhancedResponse += `${index + 1}. [${sourceUrl}](${sourceUrl})\n`;
                } else if (source.title) {
                    // Fallback to title if no URL available
                    enhancedResponse += `${index + 1}. ${source.title}\n`;
                }
            });
        }

        return enhancedResponse;
    } catch (error) {
        logger.error("🔍 [SEARCH-WORKER] Error:", error);
        throw error;
    }
}
