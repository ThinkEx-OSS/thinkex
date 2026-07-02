import { Autumn } from "autumn-js";

import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelBillingTier,
} from "#/features/workspaces/ai/models";

export const WORKSPACE_AI_MESSAGE_FEATURE_IDS = {
	standard: "standard_messages",
	premium: "premium_messages",
} as const satisfies Record<WorkspaceAiChatModelBillingTier, string>;

interface AutumnRuntimeEnv {
	AUTUMN_SECRET_KEY?: string;
}

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
): Promise<{ allowed: true } | { allowed: false; reason: "usage_limit_reached" }> {
	const autumn = getAutumnClient(input.env);

	if (!autumn) {
		return { allowed: true };
	}

	// Usage enforcement is intentionally disabled while we learn from real usage.
	// Keep this function as the future server-side gate for message quotas and
	// premium model access instead of sprinkling checks through the chat runtime.
	return { allowed: true };
}

export async function trackWorkspaceAiMessageUsage(input: TrackWorkspaceAiMessageUsageInput) {
	const autumn = getAutumnClient(input.env);

	if (!autumn) {
		console.info("[Autumn] Skipping workspace AI usage tracking: AUTUMN_SECRET_KEY is unset", {
			modelId: input.modelId,
			threadId: input.threadId,
			userId: input.userId,
			workspaceId: input.workspaceId,
		});
		return;
	}

	const model = getWorkspaceAiChatModelById(input.modelId);
	const featureId = WORKSPACE_AI_MESSAGE_FEATURE_IDS[model.billingTier];

	try {
		console.info("[Autumn] Tracking workspace AI message usage", {
			featureId,
			modelBillingTier: model.billingTier,
			modelId: model.id,
			threadId: input.threadId,
			userId: input.userId,
			workspaceId: input.workspaceId,
		});

		await autumn.customers.getOrCreate({
			customerId: input.userId,
			metadata: {
				source: "thinkex",
			},
		});

		const response = await autumn.track({
			customerId: input.userId,
			featureId,
			value: 1,
			properties: {
				workspace_id: input.workspaceId,
				thread_id: input.threadId,
				model_id: model.id,
				model_name: model.name,
				gateway_model: model.gatewayModel,
				model_provider: model.provider,
				model_billing_tier: model.billingTier,
				model_cost_level: model.cost,
				feature_surface: "workspace_ai_chat",
			},
			async: true,
		});

		console.info("[Autumn] Tracked workspace AI message usage", {
			featureId,
			modelBillingTier: model.billingTier,
			modelId: model.id,
			response,
			threadId: input.threadId,
			userId: input.userId,
			workspaceId: input.workspaceId,
		});
	} catch (error) {
		console.warn("[Autumn] Failed to track workspace AI message usage", {
			error,
			featureId,
			modelBillingTier: model.billingTier,
			modelId: input.modelId,
			threadId: input.threadId,
			userId: input.userId,
			workspaceId: input.workspaceId,
		});
	}
}

function getAutumnClient(env: Cloudflare.Env) {
	const secretKey = (env as Cloudflare.Env & AutumnRuntimeEnv).AUTUMN_SECRET_KEY?.trim();

	if (!secretKey) {
		return null;
	}

	return new Autumn({
		secretKey,
	});
}
