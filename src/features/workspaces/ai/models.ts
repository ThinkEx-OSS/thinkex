export const DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID = "auto";

// Provider grouping order for the model picker. Models are listed under their
// provider in this order.
export const WORKSPACE_AI_CHAT_PROVIDERS = [
	{ id: "anthropic", label: "Anthropic" },
	{ id: "openai", label: "OpenAI" },
	{ id: "google", label: "Google" },
] as const;

export type WorkspaceAiChatProvider = (typeof WORKSPACE_AI_CHAT_PROVIDERS)[number]["id"];

// Simple 1-4 scales aimed at non-technical users. Higher is "more" of the
// named quality (faster, smarter, pricier) — rendered as little segment bars in
// the picker, never as raw numbers or benchmark jargon.
export type WorkspaceAiChatModelLevel = 1 | 2 | 3 | 4;
export type WorkspaceAiChatModelBillingTier = "standard" | "premium";

// Slugs, names, context windows, and pricing are sourced from the live Vercel
// AI Gateway catalog (GET https://ai-gateway.vercel.sh/v1/models). Speed and
// intelligence are relative, lay-friendly estimates.
//
// `cost` is a real multiplier, not a 1-4 level: what one typical chat step
// (~15k input at ~65% cache hit, ~500 output) costs relative to Luna, priced
// across input, cached input, and output rather than output alone — output
// price by itself understates the models we send the most tokens to.
//
// Measured 1.0x / 2.5x / 4.7x / 9.5x / 10x, rounded to a clean ladder so these
// double as credit weights if usage is ever metered. Re-derive from the gateway
// catalog when the lineup changes; a stale multiplier misprices the plan.
//
// Internal only — never rendered. The picker shows a "Premium" badge off
// billingTier instead, because a raw multiplier means nothing to a user who
// isn't paying per message.
export const WORKSPACE_AI_CHAT_MODELS = [
	{
		id: "auto",
		name: "Auto",
		// Keep this a stable product choice while the server owns its availability
		// policy and fallback chain.
		gatewayModel: "openai/gpt-5.6-luna",
		provider: "auto",
		tagline: "Fast and capable by default",
		description:
			"ThinkEx picks the model for you. It stays quick for simple things and strong when the task is harder.",
		bestFor: "Everyday work",
		intelligence: 3,
		speed: 3,
		cost: 1,
		billingTier: "standard",
	},
	{
		id: "claude-sonnet",
		name: "Claude Sonnet 5",
		gatewayModel: "anthropic/claude-sonnet-5",
		provider: "anthropic",
		tagline: "Thoughtful and polished",
		description:
			"A strong all-around model that is especially good at writing, careful thinking, and polished answers.",
		bestFor: "Writing, analysis & coding",
		intelligence: 4,
		speed: 3,
		cost: 10,
		billingTier: "premium",
	},
	{
		id: "claude-haiku",
		name: "Claude Haiku 4.5",
		gatewayModel: "anthropic/claude-haiku-4.5",
		provider: "anthropic",
		tagline: "Fast and lightweight",
		description: "A quicker Claude for fast questions, short drafts, and everyday back-and-forth.",
		bestFor: "Quick help & short drafts",
		intelligence: 2,
		speed: 4,
		cost: 5,
		billingTier: "standard",
	},
	{
		id: "gpt-terra",
		name: "GPT-5.6 Terra",
		gatewayModel: "openai/gpt-5.6-terra",
		provider: "openai",
		tagline: "Strong on harder tasks",
		description:
			"A capable model for more involved tasks like planning, research, problem-solving, and detailed help.",
		bestFor: "Planning, research & knowledge work",
		intelligence: 4,
		speed: 3,
		cost: 10,
		billingTier: "premium",
	},
	{
		id: "gpt-luna",
		name: "GPT-5.6 Luna",
		gatewayModel: "openai/gpt-5.6-luna",
		provider: "openai",
		tagline: "Quick and capable",
		description: "A faster GPT for quick help, everyday questions, and practical tasks.",
		bestFor: "Fast help, tools & coding",
		intelligence: 3,
		speed: 4,
		cost: 1,
		billingTier: "standard",
	},
	{
		id: "gemini-pro",
		name: "Gemini 3.1 Pro",
		gatewayModel: "google/gemini-3.1-pro-preview",
		provider: "google",
		tagline: "Best for deeper work",
		description:
			"A stronger Gemini for harder questions, big documents, and tasks that need more depth.",
		bestFor: "Long docs, research & hard problems",
		intelligence: 4,
		speed: 2,
		cost: 10,
		billingTier: "premium",
	},
	{
		id: "gemini",
		name: "Gemini 3 Flash",
		gatewayModel: "google/gemini-3-flash",
		provider: "google",
		tagline: "Fast and wide-ranging",
		description:
			"A fast Gemini that works well for quick answers, everyday use, and reading lots of context.",
		bestFor: "Fast answers & big context",
		intelligence: 3,
		speed: 4,
		cost: 3,
		billingTier: "standard",
	},
] as const;

export type WorkspaceAiChatModel = (typeof WORKSPACE_AI_CHAT_MODELS)[number];

export type WorkspaceAiChatModelId = WorkspaceAiChatModel["id"];

export function resolveWorkspaceAiChatModelId(value: unknown): WorkspaceAiChatModelId {
	if (typeof value === "string" && WORKSPACE_AI_CHAT_MODELS.some((model) => model.id === value)) {
		return value as WorkspaceAiChatModelId;
	}

	return DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID;
}

export function getWorkspaceAiChatModelById(modelId: WorkspaceAiChatModelId): WorkspaceAiChatModel {
	return (
		WORKSPACE_AI_CHAT_MODELS.find((model) => model.id === modelId) ??
		WORKSPACE_AI_CHAT_MODELS.find((model) => model.id === DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID) ??
		WORKSPACE_AI_CHAT_MODELS[0]
	);
}

export function getWorkspaceAiChatModel(modelId: WorkspaceAiChatModelId) {
	return getWorkspaceAiChatModelById(modelId).gatewayModel;
}
