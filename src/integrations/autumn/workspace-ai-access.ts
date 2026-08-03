import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelBillingTier,
} from "#/features/workspaces/ai/models";

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
		const chosenTier = getWorkspaceAiChatModelById(input.chosenModelId).billingTier;
		const otherTier = chosenTier === "premium" ? "standard" : "premium";

		return { allowed: true, modelId: FALLBACK_MODEL_BY_TIER[otherTier] };
	}

	return { allowed: false, resetsAt: input.resetsAt };
}
