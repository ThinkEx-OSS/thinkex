import { Autumn, ResponseValidationError } from "autumn-js";
import { eq } from "drizzle-orm";

import { user } from "#/db/schema";
import { createDbContext } from "#/db/server";
import {
	getWorkspaceAiChatModelById,
	type WorkspaceAiChatModelId,
	type WorkspaceAiChatModelBillingTier,
} from "#/features/workspaces/ai/models";
import {
	logOperationalEvent,
	recordOperationalFailure,
} from "#/integrations/observability/operational-events";

export const WORKSPACE_AI_MESSAGE_FEATURE_IDS = {
	standard: "standard_messages",
	premium: "premium_messages",
} as const satisfies Record<WorkspaceAiChatModelBillingTier, string>;

interface AutumnRuntimeEnv {
	AUTUMN_SECRET_KEY?: string;
}

interface AutumnCustomerFields {
	email?: string;
	metadata: {
		account_type?: "anonymous" | "registered";
		email_verified?: boolean;
		source: "thinkex";
		user_created_at?: string;
	};
	name?: string;
}

const DEFAULT_AUTUMN_CUSTOMER_FIELDS = {
	metadata: {
		source: "thinkex",
	},
} as const satisfies AutumnCustomerFields;

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
		return;
	}

	const model = getWorkspaceAiChatModelById(input.modelId);
	const featureId = WORKSPACE_AI_MESSAGE_FEATURE_IDS[model.billingTier];
	const fields = {
		feature_id: featureId,
		model_billing_tier: model.billingTier,
		model_id: input.modelId,
		thread_id: input.threadId,
		user_id: input.userId,
		workspace_id: input.workspaceId,
	};

	try {
		const customerFields = await getAutumnCustomerFields(input.userId);

		await autumn.customers.getOrCreate({
			customerId: input.userId,
			...customerFields,
		});

		try {
			await autumn.track({
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
		} catch (error) {
			if (!(error instanceof ResponseValidationError)) {
				throw error;
			}

			// Autumn can accept an async usage event but return a slim response that
			// fails the SDK's success schema. Keep that visible without escalating it.
			logOperationalEvent({
				event: "workspace_ai_usage_tracking",
				fields: {
					...fields,
					error_type: error.name,
					operation_stage: "track_response",
				},
				outcome: "partial",
			});
		}
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.userId,
			error,
			event: "workspace_ai_usage_tracking",
			fields,
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

async function getAutumnCustomerFields(userId: string): Promise<AutumnCustomerFields> {
	let dbContext: Awaited<ReturnType<typeof createDbContext>> | undefined;

	try {
		dbContext = await createDbContext();

		const [row] = await dbContext.db
			.select({
				createdAt: user.createdAt,
				email: user.email,
				emailVerified: user.emailVerified,
				isAnonymous: user.isAnonymous,
				name: user.name,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (!row) {
			return DEFAULT_AUTUMN_CUSTOMER_FIELDS;
		}

		const isAnonymous = Boolean(row.isAnonymous);

		return {
			...(isAnonymous ? {} : getNamedCustomerFields(row)),
			metadata: {
				...DEFAULT_AUTUMN_CUSTOMER_FIELDS.metadata,
				account_type: isAnonymous ? "anonymous" : "registered",
				email_verified: row.emailVerified,
				user_created_at: row.createdAt.toISOString(),
			},
		};
	} catch (error) {
		recordOperationalFailure({
			distinctId: userId,
			error,
			event: "autumn_customer_fields",
		});

		return DEFAULT_AUTUMN_CUSTOMER_FIELDS;
	} finally {
		await dbContext?.dispose();
	}
}

function getNamedCustomerFields(row: { email: string; name: string }) {
	return {
		email: row.email.trim() || undefined,
		name: row.name.trim() || undefined,
	};
}
