import { useCustomer } from "autumn-js/react";

import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelBillingTier,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import { WORKSPACE_AI_MESSAGE_FEATURE_IDS } from "#/integrations/autumn/workspace-ai-usage";

export interface WorkspaceAiTierBalance {
	hasBalance: boolean;
	remaining: number | null;
	resetsAt: number | null;
}

export type WorkspaceAiTierBalances = Record<
	WorkspaceAiChatModelBillingTier,
	WorkspaceAiTierBalance
>;

const UNKNOWN: WorkspaceAiTierBalance = { hasBalance: true, remaining: null, resetsAt: null };

/**
 * Advisory only — `useCustomer().check()` reads the cached customer with no
 * network call, which is what makes it cheap enough to drive chat UI. The server
 * check is the actual gate; this exists so the user is told before they act
 * rather than after something unexpected happened.
 *
 * Assumes balance while loading, so nothing ever renders as blocked on a slow
 * connection and then unblocks.
 */
export function useWorkspaceAiTierBalances(): WorkspaceAiTierBalances {
	const { check, isLoading } = useCustomer();

	if (isLoading) {
		return { premium: UNKNOWN, standard: UNKNOWN };
	}

	const read = (tier: WorkspaceAiChatModelBillingTier): WorkspaceAiTierBalance => {
		const result = check({ featureId: WORKSPACE_AI_MESSAGE_FEATURE_IDS[tier] });

		return {
			hasBalance: result.allowed,
			remaining: result.balance?.remaining ?? null,
			resetsAt: result.balance?.nextResetAt ?? null,
		};
	};

	return { premium: read("premium"), standard: read("standard") };
}

export interface WorkspaceAiAllowance {
	/** True once the selected tier is empty but the other still has balance. */
	willFallBack: boolean;
	/** True once nothing is left to send with. */
	isBlocked: boolean;
	resetsAt: number | null;
}

/**
 * Scoped to the selected model on purpose: telling someone on Auto that their
 * premium balance is empty is noise about a bucket they aren't spending from.
 *
 * Reports only what happens to the next message, never a remaining count. A
 * countdown above the composer is the mechanic that makes people ration an
 * allowance they will not reach — and premium running out is not even a wall,
 * since the turn still sends on the fallback model.
 */
export function useWorkspaceAiAllowance(modelId: WorkspaceAiChatModelId): WorkspaceAiAllowance {
	const balances = useWorkspaceAiTierBalances();

	const tier = getWorkspaceAiChatModelById(modelId).billingTier;
	const selected = balances[tier];
	const fallback = balances[tier === "premium" ? "standard" : "premium"];
	const exhausted = !selected.hasBalance;

	return {
		isBlocked: exhausted && !fallback.hasBalance,
		resetsAt: selected.resetsAt,
		willFallBack: exhausted && fallback.hasBalance,
	};
}
