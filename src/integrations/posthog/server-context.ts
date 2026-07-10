import { env } from "cloudflare:workers";
import { getRequestHeaders } from "@tanstack/react-start/server";

const POSTHOG_SESSION_ID_HEADER = "x-posthog-session-id";
const POSTHOG_DISTINCT_ID_HEADER = "x-posthog-distinct-id";
const CLOUDFLARE_RAY_ID_HEADER = "cf-ray";

export interface TelemetryRequestContextProperties {
	$session_id?: string;
	request_method?: string;
	request_path?: string;
	request_id?: string;
	cloudflare_ray_id?: string;
	exception_source?: string;
	worker_version_id: string;
	worker_version_tag: string;
	worker_version_timestamp: string;
}

export interface TelemetryRequestContext {
	distinctId?: string;
	properties: TelemetryRequestContextProperties;
}

export interface TelemetryRequestDetails {
	headers?: Headers;
	method?: string;
	path?: string;
	requestId?: string;
	source?: string;
}

export function getTelemetryRequestDetails(
	request: Request,
	source: string,
	requestId?: string,
): TelemetryRequestDetails {
	return {
		headers: request.headers,
		method: request.method,
		path: new URL(request.url).pathname,
		requestId,
		source,
	};
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
	const cloudflareRayId = headers.get(CLOUDFLARE_RAY_ID_HEADER)?.trim() || undefined;
	const properties = getTelemetryRuntimeContext().properties;

	if (sessionId) {
		properties.$session_id = sessionId;
	}

	if (request.method) {
		properties.request_method = request.method;
	}

	if (request.path) {
		properties.request_path = sanitizeTelemetryRequestPath(request.path);
	}

	if (request.requestId) {
		properties.request_id = request.requestId;
	}

	if (cloudflareRayId) {
		properties.cloudflare_ray_id = cloudflareRayId;
	}

	if (request.source) {
		properties.exception_source = request.source;
	}

	return { distinctId, properties };
}

export function getTelemetryRuntimeContext(): TelemetryRequestContext {
	const version = env.CF_VERSION_METADATA;

	return {
		properties: {
			worker_version_id: version.id,
			worker_version_tag: version.tag,
			worker_version_timestamp: version.timestamp,
		},
	};
}
