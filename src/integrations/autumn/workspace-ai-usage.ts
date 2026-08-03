import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelBillingTier,
} from "#/features/workspaces/ai/models";
import { trackAutumnUsage } from "#/integrations/autumn/client";

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
	_input: CheckWorkspaceAiMessageAccessInput,
): Promise<{ allowed: true } | { allowed: false; reason: "usage_limit_reached" }> {
	// Usage enforcement is intentionally disabled while we learn from real usage.
	// Keep this function as the future server-side gate for message quotas and
	// premium model access instead of sprinkling checks through the chat runtime.
	return { allowed: true };
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
