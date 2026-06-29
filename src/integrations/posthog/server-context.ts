import { getRequestHeaders } from "@tanstack/react-start/server";

const POSTHOG_SESSION_ID_HEADER = "x-posthog-session-id";
const POSTHOG_DISTINCT_ID_HEADER = "x-posthog-distinct-id";

export interface TelemetryRequestContextProperties {
	$session_id?: string;
	request_method?: string;
	request_path?: string;
	exception_source?: string;
}

export interface TelemetryRequestContext {
	distinctId?: string;
	properties: TelemetryRequestContextProperties;
}

export const emptyTelemetryRequestContext = {
	properties: {},
} satisfies TelemetryRequestContext;

export interface TelemetryRequestDetails {
	headers?: Headers;
	method?: string;
	path?: string;
	source?: string;
	url?: string;
}

function sanitizeTelemetryRequestPath(path: string) {
	return path.replace(/^\/invite\/[^/?#]+(?=\/?$)/, "/invite/[redacted]");
}

export function getTelemetryRequestContext(
	request: TelemetryRequestDetails = {},
): TelemetryRequestContext {
	const headers = request.headers ?? getRequestHeaders();
	const distinctId = headers.get(POSTHOG_DISTINCT_ID_HEADER)?.trim() || undefined;
	const sessionId = headers.get(POSTHOG_SESSION_ID_HEADER)?.trim() || undefined;

	const properties: TelemetryRequestContextProperties = {};

	if (sessionId) {
		properties.$session_id = sessionId;
	}

	if (request.method) {
		properties.request_method = request.method;
	}

	if (request.path) {
		properties.request_path = sanitizeTelemetryRequestPath(request.path);
	}

	if (request.source) {
		properties.exception_source = request.source;
	}

	return { distinctId, properties };
}
