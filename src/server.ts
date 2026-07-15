import handler from "@tanstack/react-start/server-entry";

import { routeUserAIRequest } from "#/features/workspaces/ai/auth";
import { routeDocumentSessionRequest } from "#/features/workspaces/documents/document-session-auth";
import { routeWorkspaceKernelRequest } from "#/features/workspaces/kernel/workspace-kernel-auth";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { posthogHost, posthogHostOrigin, posthogProjectToken } from "#/integrations/posthog/config";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { buildContentSecurityPolicy } from "#/lib/http/content-security-policy";

export { CodemodeRuntime } from "@cloudflare/codemode";
export { Sandbox } from "@cloudflare/sandbox";
export { AIThread, UserAIStore } from "#/features/workspaces/ai/user-ai-agents";
export { ImageFileConverter } from "#/features/workspaces/conversion/image-file-converter";
export { OfficePdfConverter } from "#/features/workspaces/conversion/office-pdf-converter";
export { DocumentSession } from "#/features/workspaces/documents/document-session";
export { WorkspaceFileExtractionWorkflow } from "#/features/workspaces/extraction/workspace-file-extraction-workflow";
export { WorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";
export { WorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel";

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
	async fetch(request, env) {
		try {
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
				workspaceKernelResponse ?? (await handler.fetch(request)),
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
