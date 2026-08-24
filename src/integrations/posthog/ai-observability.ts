import { captureAiGeneration, type CaptureAiGenerationOptions } from "@posthog/ai";
import type { PostHog } from "posthog-node";

import { isPostHogAiObservabilityEnabled } from "#/integrations/posthog/config";
import { getPostHogServerClient } from "#/integrations/posthog/server";
import {
	schedulePostHogCapture,
	type PostHogTelemetryScheduler,
} from "#/integrations/posthog/scheduler";

function getPostHogAiClient(): PostHog | null {
	if (!isPostHogAiObservabilityEnabled) {
		return null;
	}

	return getPostHogServerClient() ?? null;
}

function appendAiTraceProperties(
	properties: Record<string, unknown>,
	input: {
		traceId?: string;
		sessionId?: string;
		spanId?: string;
		spanName?: string;
		parentId?: string;
	},
) {
	if (input.traceId) {
		properties.$ai_trace_id = input.traceId;
	}

	if (input.sessionId) {
		properties.$ai_session_id = input.sessionId;
	}

	if (input.spanId) {
		properties.$ai_span_id = input.spanId;
	}

	if (input.spanName) {
		properties.$ai_span_name = input.spanName;
	}

	if (input.parentId) {
		properties.$ai_parent_id = input.parentId;
	}
}

/**
 * Who actually answered, per the gateway's own routing record. Callers only know
 * the model they *asked* for, and the gateway fails over silently — a title
 * route that 400'd on every Google leg and was served by OpenAI looked like
 * Gemini for 105 generations. `credential_type` distinguishes our BYOK keys from
 * Vercel's metered credits.
 *
 * `serviceTier` is the tier the provider actually served, not the `priority` we
 * asked for: the gateway omits it entirely on a silent downgrade to standard.
 * That absence is the signal worth having — priority bills ~1.8-2x when granted,
 * so it tells us whether we bought latency or just asked for it.
 */
export function getGatewayServedRoute(providerMetadata: unknown) {
	const gateway = (providerMetadata as { gateway?: unknown } | undefined)?.gateway as
		| {
				serviceTier?: string;
				routing?: {
					finalProvider?: string;
					modelAttempts?: {
						canonicalSlug?: string;
						success?: boolean;
						providerAttempts?: { credentialType?: string; success?: boolean }[];
					}[];
				};
		  }
		| undefined;
	const routing = gateway?.routing;
	const modelAttempts = routing?.modelAttempts ?? [];
	const providerAttempts =
		routing?.modelAttempts?.flatMap((attempt) => attempt.providerAttempts ?? []) ?? [];
	const failedProviderAttemptCount = providerAttempts.filter((attempt) => !attempt.success).length;
	const failedModelAttemptCount = modelAttempts.filter((attempt) => !attempt.success).length;

	return {
		provider: routing?.finalProvider,
		credentialType: providerAttempts.find((attempt) => attempt.success)?.credentialType,
		serviceTier: gateway?.serviceTier,
		servedModel: routing?.modelAttempts?.find((attempt) => attempt.success)?.canonicalSlug,
		modelAttemptCount: modelAttempts.length,
		failedModelAttemptCount,
		providerAttemptCount: providerAttempts.length,
		failedProviderAttemptCount,
		routingRecovered:
			(failedModelAttemptCount > 0 || failedProviderAttemptCount > 0) &&
			modelAttempts.some((attempt) => attempt.success),
	};
}

export function capturePostHogAiGeneration(
	options: CaptureAiGenerationOptions & {
		distinctId: string;
		sessionId?: string;
		spanName?: string;
		parentId?: string;
		spanId?: string;
		schedule?: PostHogTelemetryScheduler;
		/** `providerMetadata` off the AI SDK result, for served-route attribution. */
		providerMetadata?: Record<string, unknown>;
	},
) {
	const client = getPostHogAiClient();
	if (!client) {
		return;
	}
	const { schedule, providerMetadata, ...captureOptions } = options;
	const served = getGatewayServedRoute(providerMetadata);

	if (served.provider) {
		captureOptions.provider = served.provider;
	}
	if (served.servedModel) {
		captureOptions.model = served.servedModel.split("/").at(-1) ?? served.servedModel;
	}

	const properties: Record<string, unknown> = {
		...captureOptions.properties,
		...(served.credentialType ? { credential_type: served.credentialType } : {}),
		...(served.serviceTier ? { service_tier: served.serviceTier } : {}),
		...(served.servedModel ? { served_model: served.servedModel } : {}),
		model_attempt_count: served.modelAttemptCount,
		failed_model_attempt_count: served.failedModelAttemptCount,
		provider_attempt_count: served.providerAttemptCount,
		failed_provider_attempt_count: served.failedProviderAttemptCount,
		routing_recovered: served.routingRecovered,
	};

	appendAiTraceProperties(properties, {
		traceId: options.traceId,
		sessionId: options.sessionId,
		spanId: options.spanId,
		spanName: options.spanName,
		parentId: options.parentId,
	});

	schedulePostHogCapture({
		context: {
			type: "ai_generation",
			spanName: options.spanName,
		},
		schedule,
		task: captureAiGeneration(client, {
			...captureOptions,
			// Metadata-only unless the caller has an explicit content-sharing choice.
			privacyMode: options.privacyMode ?? true,
			captureImmediate: true,
			properties,
		}),
	});
}
