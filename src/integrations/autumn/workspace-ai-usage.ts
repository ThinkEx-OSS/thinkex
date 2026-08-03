import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelBillingTier,
} from "#/features/workspaces/ai/models";
import {
	resolveWorkspaceAiMessageAccess,
	type WorkspaceAiMessageAccess,
} from "#/integrations/autumn/workspace-ai-access";
import { getAutumnClient, trackAutumnUsage } from "#/integrations/autumn/client";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

export const WORKSPACE_AI_MESSAGE_FEATURE_IDS = {
	standard: "standard_messages",
	premium: "premium_messages",
} as const satisfies Record<WorkspaceAiChatModelBillingTier, string>;

export interface TrackWorkspaceAiMessageUsageInput {
	env: Cloudflare.Env;
	modelId: WorkspaceAiChatModelId;
	threadId: string;
	userId: string;
	workspaceId: string;
}

export interface CheckWorkspaceAiMessageAccessInput {
	env: Cloudflare.Env;
	modelId: WorkspaceAiChatModelId;
	userId: string;
}

export async function checkWorkspaceAiMessageAccess(
	input: CheckWorkspaceAiMessageAccessInput,
): Promise<WorkspaceAiMessageAccess> {
	const autumn = getAutumnClient(input.env);

	// No key configured means no plans to enforce — never gate on infrastructure.
	if (!autumn) {
		return { allowed: true, modelId: input.modelId };
	}

	const chosenTier = getWorkspaceAiChatModelById(input.modelId).billingTier;
	const otherTier = chosenTier === "premium" ? "standard" : "premium";

	try {
		const chosen = await autumn.check({
			customerId: input.userId,
			featureId: WORKSPACE_AI_MESSAGE_FEATURE_IDS[chosenTier],
		});

		if (chosen.allowed) {
			return { allowed: true, modelId: input.modelId };
		}

		// Only reached once a tier is empty, so the second call costs nothing in the
		// common case.
		const fallback = await autumn.check({
			customerId: input.userId,
			featureId: WORKSPACE_AI_MESSAGE_FEATURE_IDS[otherTier],
		});

		return resolveWorkspaceAiMessageAccess({
			chosenModelId: input.modelId,
			chosenTierAllowed: false,
			fallbackTierAllowed: fallback.allowed,
			resetsAt: chosen.balance?.nextResetAt ?? null,
		});
	} catch (error) {
		// Autumn being unreachable must not take chat down with it. Fail open and
		// make the gap visible instead.
		recordOperationalFailure({
			distinctId: input.userId,
			error,
			event: "workspace_ai_access_check",
			fields: { model_id: input.modelId, user_id: input.userId },
		});

		return { allowed: true, modelId: input.modelId };
	}
}

export async function trackWorkspaceAiMessageUsage(input: TrackWorkspaceAiMessageUsageInput) {
	const model = getWorkspaceAiChatModelById(input.modelId);

	await trackAutumnUsage({
		env: input.env,
		event: "workspace_ai_usage_tracking",
		featureId: WORKSPACE_AI_MESSAGE_FEATURE_IDS[model.billingTier],
		properties: {
			feature_surface: "workspace_ai_chat",
			gateway_model: model.gatewayModel,
			model_billing_tier: model.billingTier,
			model_cost_level: model.cost,
			model_id: model.id,
			model_name: model.name,
			model_provider: model.provider,
			thread_id: input.threadId,
			workspace_id: input.workspaceId,
		},
		userId: input.userId,
	});
}
