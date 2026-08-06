import handler from "@tanstack/react-start/server-entry";

import { routeUserAIRequest } from "#/features/workspaces/ai/auth";
import { routeDocumentSessionRequest } from "#/features/workspaces/documents/document-session-auth";
import { routeWorkspaceKernelRequest } from "#/features/workspaces/kernel/workspace-kernel-auth";
import { routeMcpRequest } from "#/features/mcp/mcp-route";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { posthogHost, posthogHostOrigin, posthogProjectToken } from "#/integrations/posthog/config";
import {
	CONSENT_REQUIRED_COOKIE,
	isConsentRequiredCountry,
} from "#/integrations/posthog/consent-region";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { buildContentSecurityPolicy } from "#/lib/http/content-security-policy";
import { addPublicDiscoveryHeaders } from "#/lib/http/public-discovery";
import { fetchWithHtmlFallback } from "#/lib/http/tanstack-html-fallback";

export {
	AIThread,
	CodemodeRuntime,
	DocumentSession,
	OfficePdfConverter,
	Sandbox,
	UserAIStore,
	WorkspaceFileExtractionWorkflow,
	WorkspaceFileProcessor,
	WorkspaceKernel,
} from "#/durable-objects";

const isProduction = import.meta.env.PROD;

function buildContentSecurityPolicyReportUrl() {
	if (!posthogHost || !posthogProjectToken) {
		return undefined;
	}

	try {
		const reportUrl = new URL("/report/", posthogHost);
		reportUrl.searchParams.set("token", posthogProjectToken);
		reportUrl.searchParams.set("v", "1");

		return reportUrl.toString();
	} catch {
		return undefined;
	}
}

function isHtmlResponse(response: Response) {
	return response.headers.get("content-type")?.includes("text/html") ?? false;
}

function withSecurityHeaders(response: Response, env: Cloudflare.Env, request: Request) {
	if (!isHtmlResponse(response)) {
		return response;
	}

	const headers = new Headers(response.headers);
	addPublicDiscoveryHeaders(headers, request);
	headers.set(
		"Content-Security-Policy",
		buildContentSecurityPolicy({
			applicationOrigin: new URL(request.url).origin,
			isProduction,
			posthogHostOrigin,
			posthogReportUrl: buildContentSecurityPolicyReportUrl(),
			r2AccountId: env.R2_ACCOUNT_ID,
		}),
	);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("X-Frame-Options", "DENY");
	headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");

	// Mirror the visitor's region to a readable cookie so the client can pick the
	// right analytics default (opt-in required in the EEA/UK, opt-out elsewhere)
	// before any JS runs. Not HttpOnly by design — the browser reads it.
	const consentRequired = isConsentRequiredCountry(request.headers.get("cf-ipcountry"));
	headers.append(
		"Set-Cookie",
		`${CONSENT_REQUIRED_COOKIE}=${consentRequired ? "1" : "0"}; Path=/; SameSite=Lax${
			isProduction ? "; Secure" : ""
		}`,
	);

	if (isProduction) {
		headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
	}

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

export default {
	async fetch(request, env, ctx) {
		try {
			const mcpResponse = await routeMcpRequest(request, env, ctx);

			if (mcpResponse) {
				return mcpResponse;
			}

			const chatResponse = await routeUserAIRequest(request, env);

			if (chatResponse) {
				return chatResponse;
			}

			const documentSessionResponse = await routeDocumentSessionRequest(request, env);

			if (documentSessionResponse) {
				return documentSessionResponse;
			}

			const workspaceKernelResponse = await routeWorkspaceKernelRequest(request, env);

			return withSecurityHeaders(
				workspaceKernelResponse ??
					(await fetchWithHtmlFallback(request, (appRequest) => handler.fetch(appRequest))),
				env,
				request,
			);
		} catch (error) {
			recordOperationalFailure({
				error,
				event: "worker_request",
				fields: {
					handled_by: "worker.fetch",
				},
				request: getTelemetryRequestDetails(request, "worker.fetch"),
			});

			throw error;
		}
	},
} satisfies ExportedHandler<Env>;
