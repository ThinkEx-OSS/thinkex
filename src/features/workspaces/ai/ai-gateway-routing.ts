import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

type GatewayRoutingOptions = {
	models: string[];
	only?: string[];
	order: string[];
	sort: "ttft";
};

const GOOGLE_GATEWAY_PROVIDER_ORDER = ["google", "vertex"];
// Prefer the native Anthropic route. Bedrock can be slow to compile the tool
// catalog before rejecting unsupported constraints, so keep it last.
const CLAUDE_GATEWAY_PROVIDER_ORDER = ["anthropic", "vertex", "bedrock"];

// Keep the policy server-side and independent from picker copy. Each order
// puts ThinkEx's configured BYOK providers first. It is intentionally a
// preference rather than an allowlist so cross-provider model fallbacks remain
// reachable if no preferred provider can serve a request.
const workspaceAiGatewayRouting: Record<WorkspaceAiChatModelId, GatewayRoutingOptions> = {
	auto: {
		order: ["openai", "azure"],
		models: ["google/gemini-3-flash", "anthropic/claude-haiku-4.5"],
		sort: "ttft",
	},
	"claude-sonnet": {
		order: CLAUDE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-terra", "google/gemini-3.1-pro-preview"],
		sort: "ttft",
	},
	"claude-haiku": {
		only: CLAUDE_GATEWAY_PROVIDER_ORDER,
		order: CLAUDE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-luna", "google/gemini-3-flash"],
		sort: "ttft",
	},
	"gpt-terra": {
		order: ["openai", "azure"],
		models: ["anthropic/claude-sonnet-5", "google/gemini-3.1-pro-preview"],
		sort: "ttft",
	},
	"gpt-luna": {
		order: ["openai", "azure"],
		models: ["google/gemini-3-flash", "anthropic/claude-haiku-4.5"],
		sort: "ttft",
	},
	"gemini-pro": {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-terra", "anthropic/claude-sonnet-5"],
		sort: "ttft",
	},
	gemini: {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-5.6-luna", "anthropic/claude-haiku-4.5"],
		sort: "ttft",
	},
};

export function getWorkspaceAiGatewayRoutingOptions(modelId: WorkspaceAiChatModelId) {
	return workspaceAiGatewayRouting[modelId];
}

export function getAIThreadTitleGatewayRoutingOptions() {
	return {
		order: GOOGLE_GATEWAY_PROVIDER_ORDER,
		models: ["openai/gpt-4.1-nano"],
		sort: "ttft" as const,
	};
}
