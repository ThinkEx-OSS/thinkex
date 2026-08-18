import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

type GatewayRoutingOptions = {
	models: string[];
	only?: string[];
	order: string[];
};

const GOOGLE_GATEWAY_PROVIDER_ORDER = ["google", "vertex"];
// The native Anthropic route is the only one we want. Vertex has no Anthropic
// quota in our GCP project (429 in ~200ms) and Bedrock has no Sonnet 5 access
// (403), so both only ever landed on Vercel's own credits. Cross-model fallback
// below covers a genuine Anthropic outage; add a provider back here if its
// account-side access is ever granted.
const CLAUDE_GATEWAY_PROVIDER_ORDER = ["anthropic"];
// `only` is the gateway's sole exclusion primitive, and it is a hard filter over
// the whole request — the fallback models below are unreachable unless their
// providers are listed too, which is what silently stranded them before. So:
// anthropic serves Claude, and openai/google exist purely to keep the fallbacks
// alive. `vertex` stays out because allowlisting it re-admits vertexAnthropic;
// the Gemini fallback therefore runs on Vercel's credits rather than our Vertex
// key, which is acceptable for a leg that has never fired.
const CLAUDE_GATEWAY_PROVIDER_ALLOWLIST = ["anthropic", "openai", "google"];

// Keep the policy server-side and independent from picker copy. Each order
// puts ThinkEx's configured BYOK providers first. It is intentionally a
// preference rather than an allowlist so cross-provider model fallbacks remain
// reachable if no preferred provider can serve a request.
const workspaceAiGatewayRouting: Record<WorkspaceAiChatModelId, GatewayRoutingOptions> = {
	auto: {
		order: ["openai", "azure"],
		models: ["google/gemini-3-flash", "anthropic/claude-haiku-4.5"],
	},
	"claude-sonnet": {
		only: CLAUDE_GATEWAY_PROVIDER_ALLOWLIST,
		order: CLAUDE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-terra", "google/gemini-3.1-pro-preview"],
	},
	"claude-haiku": {
		only: CLAUDE_GATEWAY_PROVIDER_ALLOWLIST,
		order: CLAUDE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-luna", "google/gemini-3-flash"],
	},
	"gpt-terra": {
		order: ["openai", "azure"],
		models: ["anthropic/claude-sonnet-5", "google/gemini-3.1-pro-preview"],
	},
	"gpt-luna": {
		order: ["openai", "azure"],
		models: ["google/gemini-3-flash", "anthropic/claude-haiku-4.5"],
	},
	"gemini-pro": {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-terra", "anthropic/claude-sonnet-5"],
	},
	gemini: {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-luna", "anthropic/claude-haiku-4.5"],
	},
};

export function getWorkspaceAiGatewayRoutingOptions(modelId: WorkspaceAiChatModelId) {
	return workspaceAiGatewayRouting[modelId];
}

export function getAIThreadTitleGatewayRoutingOptions() {
	return {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		// Cross-provider backstop for the Google primary. gpt-4.1-nano was retired
		// from ChatGPT and has an Azure end-of-life with no named successor, so
		// track a current nano instead.
		models: ["openai/gpt-5.4-nano"],
	};
}

export function getWorkspaceImageExtractionGatewayRoutingOptions() {
	return {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		// Cross-provider backstop so a Google outage still gets an image read.
		// Both fallbacks accept image input; a text-only model would 400 the leg.
		models: ["openai/gpt-5.6-luna", "anthropic/claude-haiku-4.5"],
	};
}
