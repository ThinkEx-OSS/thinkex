import { captureAiGeneration, type CaptureAiGenerationOptions } from "@posthog/ai";
import type { PostHog } from "posthog-node";

import { isPostHogAiObservabilityEnabled } from "#/integrations/posthog/config";
import { getPostHogServerClient } from "#/integrations/posthog/server";
import {
	schedulePostHogCapture,
	type PostHogTelemetryScheduler,
} from "#/integrations/posthog/scheduler";

export interface PostHogAiSpanInput {
	distinctId: string;
	traceId: string;
	sessionId: string;
	spanId: string;
	spanName: string;
	parentId?: string;
	inputState?: unknown;
	outputState?: unknown;
	latencySeconds?: number;
	isError?: boolean;
	error?: unknown;
	properties?: Record<string, unknown>;
	schedule?: PostHogTelemetryScheduler;
}

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
						providerAttempts?: { credentialType?: string; success?: boolean }[];
					}[];
				};
		  }
		| undefined;
	const routing = gateway?.routing;

	return {
		provider: routing?.finalProvider,
		credentialType: routing?.modelAttempts
			?.flatMap((attempt) => attempt.providerAttempts ?? [])
			.find((attempt) => attempt.success)?.credentialType,
		serviceTier: gateway?.serviceTier,
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

	const properties: Record<string, unknown> = {
		...captureOptions.properties,
		...(served.credentialType ? { credential_type: served.credentialType } : {}),
		...(served.serviceTier ? { service_tier: served.serviceTier } : {}),
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

export function capturePostHogAiSpan(input: PostHogAiSpanInput) {
	const client = getPostHogAiClient();
	if (!client) {
		return;
	}

	const properties: Record<string, unknown> = {
		...input.properties,
	};

	appendAiTraceProperties(properties, input);

	if (input.inputState !== undefined) {
		properties.$ai_input_state = input.inputState;
	}

	if (input.outputState !== undefined) {
		properties.$ai_output_state = input.outputState;
	}

	if (input.latencySeconds !== undefined) {
		properties.$ai_latency = input.latencySeconds;
	}

	if (input.isError) {
		properties.$ai_is_error = true;
		properties.$ai_error =
			input.error instanceof Error
				? input.error.message
				: typeof input.error === "string"
					? input.error
					: JSON.stringify(input.error);
	}

	schedulePostHogCapture({
		context: {
			type: "ai_span",
			spanName: input.spanName,
		},
		schedule: input.schedule,
		task: client
			.captureImmediate({
				distinctId: input.distinctId,
				event: "$ai_span",
				properties,
			})
			.then(() => undefined),
	});
}
