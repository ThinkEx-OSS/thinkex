import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

type GatewayRoutingOptions = {
	models: readonly string[];
	order: readonly string[];
	sort: "ttft";
};

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
		order: ["bedrock", "vertex"],
		models: ["openai/gpt-5.4", "google/gemini-3.1-pro-preview"],
		sort: "ttft",
	},
	"claude-haiku": {
		order: ["bedrock", "vertex"],
		models: ["openai/gpt-5.4-mini", "google/gemini-3-flash"],
		sort: "ttft",
	},
	chatgpt: {
		order: ["openai", "azure"],
		models: ["anthropic/claude-sonnet-4.6", "google/gemini-3.1-pro-preview"],
		sort: "ttft",
	},
	"chatgpt-mini": {
		order: ["openai", "azure"],
		models: ["google/gemini-3-flash", "anthropic/claude-haiku-4.5"],
		sort: "ttft",
	},
	"gemini-pro": {
		order: ["vertex"],
		models: ["openai/gpt-5.4", "anthropic/claude-sonnet-4.6"],
		sort: "ttft",
	},
	gemini: {
		order: ["vertex"],
		models: ["openai/gpt-5.4-mini", "anthropic/claude-haiku-4.5"],
		sort: "ttft",
	},
};

export function getWorkspaceAiGatewayRoutingOptions(modelId: WorkspaceAiChatModelId) {
	return workspaceAiGatewayRouting[modelId];
}

export function getAIThreadTitleGatewayRoutingOptions() {
	return {
		order: ["vertex"],
		models: ["openai/gpt-4.1-nano"],
		sort: "ttft" as const,
	};
}
