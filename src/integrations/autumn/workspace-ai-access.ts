import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelBillingTier,
} from "#/features/workspaces/ai/models";

/**
 * Lives here rather than next to the Autumn calls because the chat UI needs it
 * too, and this module is the half with no server-only imports.
 */
export const WORKSPACE_AI_MESSAGE_FEATURE_IDS = {
	standard: "standard_messages",
	premium: "premium_messages",
} as const satisfies Record<WorkspaceAiChatModelBillingTier, string>;

/**
 * Where a turn goes when the tier it asked for is empty. Points at catalog slots
 * rather than gateway models, so repointing `auto` moves the fallback with it.
 */
const FALLBACK_MODEL_BY_TIER = {
	standard: "auto",
	premium: "claude-sonnet",
} as const satisfies Record<WorkspaceAiChatModelBillingTier, WorkspaceAiChatModelId>;

/**
 * Returns the model the turn should actually run on, so callers use what they're
 * given rather than branching on whether a downgrade happened.
 */
export type WorkspaceAiMessageAccess =
	| { allowed: true; modelId: WorkspaceAiChatModelId }
	| { allowed: false; resetsAt: number | null };

function getWorkspaceAiFallbackModelId(modelId: WorkspaceAiChatModelId): WorkspaceAiChatModelId {
	const chosenTier = getWorkspaceAiChatModelById(modelId).billingTier;

	return FALLBACK_MODEL_BY_TIER[chosenTier === "premium" ? "standard" : "premium"];
}

/**
 * The decision itself, separated from the Autumn round-trips so the whole matrix
 * is testable without a network or a customer.
 */
export function resolveWorkspaceAiMessageAccess(input: {
	chosenModelId: WorkspaceAiChatModelId;
	chosenTierAllowed: boolean;
	fallbackTierAllowed: boolean;
	resetsAt: number | null;
}): WorkspaceAiMessageAccess {
	if (input.chosenTierAllowed) {
		return { allowed: true, modelId: input.chosenModelId };
	}

	// Falling through to the other tier keeps the default model working: if `auto`
	// blocked the moment standard ran out, the model most people never change
	// would be the first thing to break.
	if (input.fallbackTierAllowed) {
		return { allowed: true, modelId: getWorkspaceAiFallbackModelId(input.chosenModelId) };
	}

	return { allowed: false, resetsAt: input.resetsAt };
}
