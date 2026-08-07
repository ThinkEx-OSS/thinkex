import { PostHog } from "posthog-node";

import { isPostHogEnabled, posthogHost, posthogProjectToken } from "#/integrations/posthog/config";
import { hasServerAnalyticsConsent } from "#/integrations/posthog/consent.server";
import type {
	PostHogEventPropertiesByName,
	PostHogServerEventName,
} from "#/integrations/posthog/events";
import {
	getTelemetryRequestContext,
	getTelemetryRuntimeContext,
	type TelemetryRequestContext,
	type TelemetryRequestDetails,
} from "#/integrations/posthog/server-context";
import {
	schedulePostHogCapture,
	type PostHogTelemetryScheduler,
} from "#/integrations/posthog/scheduler";

const posthogServerClient =
	posthogProjectToken && posthogHost
		? new PostHog(posthogProjectToken, {
				host: posthogHost,
			})
		: null;

export function getPostHogServerClient() {
	return posthogServerClient;
}

interface PostHogServerEvent<TEvent extends PostHogServerEventName> {
	distinctId: string;
	event: TEvent;
	/** Person properties PostHog must set atomically with this event. */
	personProperties?: Record<string, unknown>;
	/**
	 * Set false for background work with no real user. The caller still has to pass
	 * some distinct id, and a synthetic one (workflow instance, request id) would
	 * otherwise register a brand new person per run and inflate user counts.
	 */
	processPerson?: boolean;
	/**
	 * Skip the analytics-consent gate for telemetry that rests on a lawful basis
	 * other than consent — operational reliability (legitimate interest) or
	 * billing/usage enforcement (contractual necessity). These carry only
	 * pseudonymous ids and operational metrics — no email, name, or content — and
	 * often run outside request scope where the consent cookie isn't readable.
	 * The lawful basis is stated per call site.
	 */
	consentExempt?: boolean;
	properties: PostHogEventPropertiesByName[TEvent];
	requestContext?: TelemetryRequestContext;
	request?: TelemetryRequestDetails;
	schedule?: PostHogTelemetryScheduler;
	timestamp?: Date | string;
}

function isPostHogServerTrackingEnabled() {
	return isPostHogEnabled && posthogServerClient !== null;
}

interface PostHogServerExceptionInput {
	distinctId?: string;
	error: unknown;
	properties?: Record<string, unknown>;
	requestContext?: TelemetryRequestContext;
	request?: TelemetryRequestDetails;
	schedule?: PostHogTelemetryScheduler;
}

// Only read request scope when a request was supplied: getRequestHeaders() resolves
// through AsyncLocalStorage and throws in a Durable Object, Workflow, or alarm.
function resolveTelemetryContext(input: {
	request?: TelemetryRequestDetails;
	requestContext?: TelemetryRequestContext;
}) {
	return (
		input.requestContext ??
		(input.request ? getTelemetryRequestContext(input.request) : getTelemetryRuntimeContext())
	);
}

export function capturePostHogServerEvent<TEvent extends PostHogServerEventName>(
	input: PostHogServerEvent<TEvent>,
) {
	if (!isPostHogServerTrackingEnabled() || !posthogServerClient) {
		return;
	}

	// Product analytics require consent; operational/billing telemetry (flagged
	// consentExempt) and exception capture are exempt as they carry no
	// email/name/content and rely on a different lawful basis.
	if (!input.consentExempt && !hasServerAnalyticsConsent(input.request?.headers)) {
		return;
	}

	const requestContext = resolveTelemetryContext(input);
	const timestamp =
		input.timestamp instanceof Date
			? input.timestamp
			: typeof input.timestamp === "string"
				? new Date(input.timestamp)
				: undefined;

	schedulePostHogCapture({
		context: {
			event: input.event,
			type: "event",
		},
		schedule: input.schedule,
		task: posthogServerClient
			.captureImmediate({
				distinctId: input.distinctId,
				event: input.event,
				properties: {
					...requestContext.properties,
					...input.properties,
					...(input.personProperties ? { $set: input.personProperties } : {}),
					...(input.processPerson === false ? { $process_person_profile: false } : {}),
				},
				...(timestamp ? { timestamp } : {}),
			})
			.then(() => undefined),
	});
}

export function capturePostHogServerException(input: PostHogServerExceptionInput) {
	if (!isPostHogServerTrackingEnabled() || !posthogServerClient) {
		return;
	}

	const requestContext = resolveTelemetryContext(input);

	schedulePostHogCapture({
		context: {
			type: "exception",
		},
		schedule: input.schedule,
		task: posthogServerClient
			.captureExceptionImmediate(input.error, input.distinctId ?? requestContext.distinctId, {
				...requestContext.properties,
				...input.properties,
			})
			.then(() => undefined),
	});
}
