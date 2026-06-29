import { PostHog } from "posthog-node";

import { isPostHogEnabled, posthogHost, posthogProjectToken } from "#/integrations/posthog/config";
import type {
	PostHogEventPropertiesByName,
	PostHogServerEventName,
} from "#/integrations/posthog/events";
import {
	getTelemetryRequestContext,
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

export function capturePostHogServerEvent<TEvent extends PostHogServerEventName>(
	input: PostHogServerEvent<TEvent>,
) {
	if (!isPostHogServerTrackingEnabled() || !posthogServerClient) {
		return;
	}

	const requestContext = input.requestContext ?? getTelemetryRequestContext(input.request);
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

	const requestContext = input.requestContext ?? getTelemetryRequestContext(input.request);

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
