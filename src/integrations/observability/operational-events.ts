import { capturePostHogServerException } from "#/integrations/posthog/server";
import {
	getTelemetryRequestContext,
	getTelemetryRuntimeContext,
	type TelemetryRequestContext,
	type TelemetryRequestDetails,
} from "#/integrations/posthog/server-context";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

type OperationalEventValue = boolean | null | number | string | readonly string[] | undefined;
type OperationalEventFields = Record<string, OperationalEventValue>;

interface OperationalEventInput {
	event: string;
	fields?: OperationalEventFields;
	outcome: "error" | "partial" | "rejected" | "success";
	requestContext?: TelemetryRequestContext;
}

interface OperationalFailureInput {
	distinctId?: string;
	error: unknown;
	event: string;
	fields?: OperationalEventFields;
	request?: TelemetryRequestDetails;
	requestContext?: TelemetryRequestContext;
	schedule?: PostHogTelemetryScheduler;
}

type OperationalOutcomeInput = Omit<OperationalEventInput, "outcome"> & {
	distinctId?: string;
	error?: unknown;
	outcome?: OperationalEventInput["outcome"];
	request?: TelemetryRequestDetails;
	schedule?: PostHogTelemetryScheduler;
};

export function logOperationalEvent(input: OperationalEventInput) {
	const payload = buildOperationalEvent(input);

	if (input.outcome === "error") {
		console.error(payload);
		return;
	}

	console.info(payload);
}

export function recordOperationalFailure(input: OperationalFailureInput) {
	const requestContext =
		input.requestContext ??
		(input.request ? getTelemetryRequestContext(input.request) : getTelemetryRuntimeContext());
	const fields = {
		...input.fields,
		error_type: input.error instanceof Error ? input.error.name : "UnknownError",
	};

	logOperationalEvent({
		event: input.event,
		fields,
		outcome: "error",
		requestContext,
	});

	capturePostHogServerException({
		distinctId: input.distinctId,
		error: input.error,
		properties: {
			operation: input.event,
			...input.fields,
		},
		requestContext,
		schedule: input.schedule,
	});
}

export function recordOperationalOutcome(input: OperationalOutcomeInput) {
	if (input.error !== undefined) {
		recordOperationalFailure({
			distinctId: input.distinctId,
			error: input.error,
			event: input.event,
			fields: input.fields,
			request: input.request,
			requestContext: input.requestContext,
			schedule: input.schedule,
		});
		return;
	}

	const requestContext =
		input.requestContext ??
		(input.request ? getTelemetryRequestContext(input.request) : getTelemetryRuntimeContext());

	logOperationalEvent({
		event: input.event,
		fields: input.fields,
		outcome: input.outcome ?? "success",
		requestContext,
	});
}

export function buildOperationalEvent(input: OperationalEventInput) {
	return {
		event: input.event,
		outcome: input.outcome,
		service: "thinkex",
		...input.requestContext?.properties,
		...input.fields,
	};
}
