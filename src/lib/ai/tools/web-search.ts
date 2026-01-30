import { z } from "zod";
import { tool, generateText, stepCountIs, zodSchema } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Create a custom web search tool that uses a lightweight model to perform the search
 * and synthesize results before returning to the main conversation.
 */
export function createWebSearchTool() {
    return tool({
        description: 'Search the web for current, up-to-date information on any topic. Use this when you need recent news, research, or information not in your training data.',
        inputSchema: zodSchema(
            z.object({
                query: z.string().min(1).max(500).describe('The search query to look up on the web')
            })
        ),
        execute: async ({ query }) => {
            // Use a lightweight model for the internal search loop
            const { text, providerMetadata } = await generateText({
                model: google('gemini-2.5-flash-lite'),
                tools: {
                    googleSearch: google.tools.googleSearch({}),
                },
                prompt: `Search the web and provide comprehensive information about: ${query}

Please use the search tool to find current, accurate information and provide a detailed response with key findings.`,
                stopWhen: stepCountIs(10), // Allow the model steps to search and synthesize
            });

            // Return both text and metadata as a JSON string for the UI to parse
            return JSON.stringify({
                text,
                groundingMetadata: (providerMetadata?.google as any)?.groundingMetadata
            });
        },
    });
}
