import { z } from "zod";
import { tool, generateText, stepCountIs, zodSchema } from "ai";
import { google } from "@ai-sdk/google";

const VERTEX_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const VERTEX_REDIRECT_PATH = "/grounding-api-redirect/";
const USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

const isVertexRedirectUrl = (url: string) => {
    try {
        const parsed = new URL(url);
        return parsed.hostname === VERTEX_REDIRECT_HOST && parsed.pathname.startsWith(VERTEX_REDIRECT_PATH);
    } catch {
        return false;
    }
};

const resolveRedirectUrl = async (url: string) => {
    const maxHops = 6;
    let current = url;

    for (let i = 0; i < maxHops; i += 1) {
        try {
            const response = await fetch(current, {
                method: "GET",
                redirect: "manual",
                headers: {
                    "user-agent": USER_AGENT,
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "accept-language": "en-US,en;q=0.9",
                },
                signal: AbortSignal.timeout(6000),
            });

            const location = response.headers.get("location");
            if (response.status >= 300 && response.status < 400 && location) {
                const next = new URL(location, current).toString();
                if (next === current) break;
                current = next;
                continue;
            }

            return response.url || current;
        } catch {
            break;
        }
    }

    try {
        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            headers: { "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(6000),
        });
        return response.url || null;
    } catch {
        return null;
    }
};

/**
 * Extract sources from Google grounding metadata chunks and resolve Vertex redirect URLs.
 * Used by autogen and other consumers that need sources for notes.
 */
export async function resolveGroundingChunksToSources(
    groundingChunks: unknown[] | null | undefined
): Promise<Array<{ title: string; url: string }>> {
    if (!groundingChunks || !Array.isArray(groundingChunks)) return [];

    const resolved = await Promise.all(
        groundingChunks.map(async (chunk: any) => {
            const uri = chunk?.web?.uri;
            const title = chunk?.web?.title || "Source";
            if (!uri) return null;

            let url = uri;
            if (isVertexRedirectUrl(uri)) {
                const resolvedUrl = await resolveRedirectUrl(uri);
                if (resolvedUrl && !isVertexRedirectUrl(resolvedUrl)) {
                    url = resolvedUrl;
                }
            }

            return { title, url };
        })
    );

    return resolved.filter((s): s is { title: string; url: string } => s !== null);
}

export type WebSearchResult = {
    text: string;
    sources: Array<{ title: string; url: string }>;
    groundingMetadata?: { groundingChunks?: unknown[] };
};

/**
 * Execute a web search and return text + sources. Used by both chat webSearch tool and autogen.
 */
export async function executeWebSearch(query: string): Promise<WebSearchResult> {
    const { text, providerMetadata } = await generateText({
        model: google('gemini-2.5-flash-lite'),
        tools: {
            googleSearch: google.tools.googleSearch({ mode: 'MODE_UNSPECIFIED' }),
        },
        prompt: `Search the web for current, accurate information about: ${query}

Use the search tool to find relevant sources. Format your response as:
Summary: [2-4 sentence overview]
Key findings:
- [Finding 1]
- [Finding 2]
- [Additional findings]`,
        stopWhen: stepCountIs(10),
    });

    const groundingMetadata = (providerMetadata?.google as { groundingMetadata?: { groundingChunks?: unknown[] } })?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks;
    const sources = await resolveGroundingChunksToSources(groundingChunks);

    const resolvedChunks = groundingChunks
        ? await Promise.all(
            (groundingChunks as any[]).map(async (chunk) => {
                const uri = chunk?.web?.uri;
                if (!uri || !isVertexRedirectUrl(uri)) return chunk;
                const resolved = await resolveRedirectUrl(uri);
                if (!resolved || isVertexRedirectUrl(resolved)) return chunk;
                return { ...chunk, web: { ...chunk.web, uri: resolved } };
            })
        )
        : groundingChunks;

    const resolvedMetadata = groundingMetadata
        ? { ...groundingMetadata, groundingChunks: resolvedChunks }
        : groundingMetadata;

    return { text, sources, groundingMetadata: resolvedMetadata };
}

/**
 * Create a custom web search tool that uses a lightweight model to perform the search
 * and synthesize results before returning to the main conversation.
 */
export function createWebSearchTool() {
    return tool({
        description: "Search the web for current information.",
        inputSchema: zodSchema(
            z.object({
                query: z.string().min(1).max(500).describe('The search query to look up on the web')
            })
        ),
        execute: async ({ query }) => {
            const { text, groundingMetadata } = await executeWebSearch(query);
            return JSON.stringify({ text, groundingMetadata });
        },
    });
}
