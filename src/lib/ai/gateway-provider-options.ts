import { gateway } from "ai";
import { getModelDefinition } from "@/lib/ai/models";

export type GatewayProviderOptionsContext = {
  userId?: string | null;
};

/**
 * Shared AI Gateway + provider-specific options for streamText / generateText.
 * Matches behavior previously inlined in POST /api/chat.
 */
export function buildGatewayProviderOptions(
  gatewayModelId: string,
  ctx: GatewayProviderOptionsContext = {},
): Record<string, unknown> {
  const gatewayOptions: Record<string, unknown> = {
    caching: "auto",
    models: [gatewayModelId],
    ...(ctx.userId ? { user: ctx.userId } : {}),
  };

  const def = getModelDefinition(gatewayModelId);
  if (def?.gateway?.routing) {
    gatewayOptions.order = def.gateway.routing.order;
    gatewayOptions.only = def.gateway.routing.only;
  } else if (gatewayModelId.startsWith("anthropic/")) {
    gatewayOptions.order = ["bedrock", "anthropic"];
    gatewayOptions.only = ["bedrock", "anthropic"];
  }

  const googleConfig: Record<string, unknown> = {
    grounding: {
      // googleSearchRetrieval removed to force usage of explicit web_search tool
    },
    thinkingConfig: {
      includeThoughts: true,
    },
  };

  if (gatewayModelId.includes("gemini-3-flash")) {
    (googleConfig.thinkingConfig as Record<string, unknown>).thinkingLevel =
      "minimal";
  }

  return {
    gateway: gatewayOptions,
    google: googleConfig,
  };
}

export function createGatewayLanguageModel(gatewayModelId: string) {
  return gateway(gatewayModelId);
}

/** App attribution headers for AI Gateway (see Vercel app attribution docs). */
export function getGatewayAttributionHeaders(): Record<string, string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://thinkex.app";
  return {
    "http-referer": appUrl,
    "x-title": "ThinkEx",
  };
}
