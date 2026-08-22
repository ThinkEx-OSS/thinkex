import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { apiError } from "#/lib/api/response";

export { apiError, apiJson, getRequestId } from "#/lib/api/response";

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
