import { apiErrorSchema } from "#/lib/api/contracts";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";

function respond(body: unknown, status: number, requestId: string) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"x-request-id": requestId,
		},
	});
}

export function getRequestId(request: Request) {
	return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function apiJson(body: unknown, requestId: string, status = 200) {
	return respond(body, status, requestId);
}

export function apiError(
	requestId: string,
	status: number,
	code: string,
	message: string,
	details?: unknown,
) {
	const payload = apiErrorSchema.parse({
		requestId,
		code,
		message,
		details,
	});

	return respond(payload, status, requestId);
}

interface ApiFailureInput {
	cause: unknown;
	code: string;
	fields?: Record<string, boolean | null | number | string | undefined>;
	message: string;
	request: Request;
	requestId: string;
	status: number;
}

export function apiFailure(input: ApiFailureInput) {
	recordOperationalFailure({
		error: input.cause,
		event: "api_request",
		fields: {
			api_error_code: input.code,
			status_code: input.status,
			...input.fields,
		},
		request: getTelemetryRequestDetails(input.request, "api", input.requestId),
	});

	return apiError(input.requestId, input.status, input.code, input.message);
}
