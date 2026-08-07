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
 * Where a premium turn goes when premium is empty. Points at a catalog slot
 * rather than a gateway model, so repointing `auto` moves the fallback with it.
 *
 * There is deliberately no fallback the other way. Standard running out used to
 * promote the turn to a premium model, which handed the priciest model in the
 * catalog to whoever had consumed the most, billed it against the tier that is
 * the upgrade prompt, and made quality climb right before the wall. Standard
 * running out *is* the wall — a premium model from there is a deliberate pick,
 * not something we spend on their behalf.
 */
const STANDARD_FALLBACK_MODEL_ID = "auto" satisfies WorkspaceAiChatModelId;

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

	// Only premium falls through. Keeping `auto` alive past its own tier would
	// mean spending premium to do it — see STANDARD_FALLBACK_MODEL_ID.
	if (
		input.fallbackTierAllowed &&
		getWorkspaceAiChatModelById(input.chosenModelId).billingTier === "premium"
	) {
		return { allowed: true, modelId: STANDARD_FALLBACK_MODEL_ID };
	}

	return { allowed: false, resetsAt: input.resetsAt };
}
