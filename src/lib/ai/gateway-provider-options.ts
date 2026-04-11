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
    ...(ctx.userId ? { user: ctx.userId } : {}),
  };

  const def = getModelDefinition(gatewayModelId);

  if (def?.gateway?.fallbacks?.length) {
    gatewayOptions.models = def.gateway.fallbacks;
  }

  if (def?.gateway?.routing) {
    gatewayOptions.order = def.gateway.routing.order;
    gatewayOptions.only = def.gateway.routing.only;
  } else if (gatewayModelId.startsWith("anthropic/")) {
    gatewayOptions.order = ["bedrock", "azure", "anthropic"];
    gatewayOptions.only = ["bedrock", "azure", "anthropic"];
  }

  gatewayOptions.providerTimeouts = {
    byok: {
      bedrock: 12000,
      azure: 10000,
      anthropic: 10000,
      google: 10000,
      vertex: 12000,
      openai: 10000,
    },
  };

  const providerSpecificOptions: Record<string, unknown> = {};
  const reasoning = def?.gateway?.reasoning;

  const googleConfig: Record<string, unknown> = {
    grounding: {
      // googleSearchRetrieval removed to force usage of explicit web_search tool
    },
  };

  if (reasoning?.google) {
    Object.assign(googleConfig, reasoning.google);
  } else if (gatewayModelId.includes("gemini")) {
    googleConfig.thinkingConfig = {
      includeThoughts: true,
    };
  }

  providerSpecificOptions.google = googleConfig;

  if (reasoning?.anthropic) {
    providerSpecificOptions.anthropic = reasoning.anthropic;
  }

  if (reasoning?.openai) {
    providerSpecificOptions.openai = reasoning.openai;
  }

  return {
    gateway: gatewayOptions,
    ...providerSpecificOptions,
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
