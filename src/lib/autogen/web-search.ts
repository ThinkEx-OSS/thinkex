import { generateText, stepCountIs, type ToolSet } from "ai";
import { google } from "@ai-sdk/google";
import { getGatewayModelIdForPurpose } from "@/lib/gateway/models";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/gateway/provider-options";

const VERTEX_REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const VERTEX_REDIRECT_PATH = "/grounding-api-redirect/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export interface WebSearchResult {
  text: string;
  sources: Array<{ title: string; url: string }>;
  groundingMetadata?: unknown;
}

export function matchesWebSearchStreamToolName(name: string | undefined): boolean {
  return name === "web_search" || name === "webSearch";
}

export function isVertexRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === VERTEX_REDIRECT_HOST &&
      parsed.pathname.startsWith(VERTEX_REDIRECT_PATH)
    );
  } catch {
    return false;
  }
}

export async function resolveRedirectUrl(url: string): Promise<string | null> {
  const maxHops = 6;
  let current = url;

  for (let i = 0; i < maxHops; i += 1) {
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
}

export async function resolveGroundingChunksToSources(
  groundingChunks: unknown[] | null | undefined,
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
    }),
  );

  return resolved.filter(
    (source): source is { title: string; url: string } => source !== null,
  );
}

export async function executeWebSearch(query: string): Promise<WebSearchResult> {
  const gatewayModelId = getGatewayModelIdForPurpose("web-search");
  const baseProviderOptions = buildGatewayProviderOptions(
    gatewayModelId,
  ) as Record<string, any>;
  const { text, providerMetadata } = await generateText({
    model: createGatewayLanguageModel(gatewayModelId),
    providerOptions: {
      ...baseProviderOptions,
      gateway: {
        ...baseProviderOptions.gateway,
        only: ["google"],
        order: ["google"],
      },
    },
    headers: getGatewayAttributionHeaders(),
    tools: {
      googleSearch: google.tools.googleSearch({}),
    } as ToolSet,
    experimental_telemetry: { isEnabled: true },
    prompt: `Search the web for current, accurate information about: ${query}

Use the search tool to find relevant sources. Format your response as:
Summary: [2-4 sentence overview]
Key findings:
- [Finding 1]
- [Finding 2]
- [Additional findings]`,
    stopWhen: stepCountIs(10),
  });
  const resolvedProvider =
    (providerMetadata as any)?.gateway?.routing?.resolvedProvider ??
    (providerMetadata as any)?.gateway?.routing?.finalProvider;
  if (resolvedProvider) {
    console.log("[web-search] Gateway resolved provider:", resolvedProvider);
  }

  const groundingMetadata = (
    providerMetadata?.google as {
      groundingMetadata?: { groundingChunks?: unknown[] };
    }
  )?.groundingMetadata;
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
        }),
      )
    : groundingChunks;

  const resolvedMetadata = groundingMetadata
    ? { ...groundingMetadata, groundingChunks: resolvedChunks }
    : groundingMetadata;

  return { text, sources: sources ?? [], groundingMetadata: resolvedMetadata };
}
