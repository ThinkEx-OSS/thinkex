import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import {
	createWorkspaceDocumentPdf,
	WorkspaceDocumentNotFoundError,
} from "#/features/workspaces/export/workspace-document-pdf";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, apiFailure, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

async function handleWorkspaceDocumentPdf(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) {
		return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in to export a document.");
	}

	try {
		const pdf = await createWorkspaceDocumentPdf({
			env,
			itemId,
			userId: session.user.id,
			workspaceId,
		});
		const headers = new Headers({
			"cache-control": "private, no-store",
			"content-disposition": getAttachmentHeader(pdf.fileName),
			"content-type": "application/pdf",
			"x-request-id": requestId,
		});
		if (pdf.contentLength) {
			headers.set("content-length", pdf.contentLength);
		}

		return new Response(pdf.stream, { headers });
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(
				requestId,
				403,
				"FORBIDDEN",
				"You do not have permission to export this workspace.",
			);
		}
		if (error instanceof WorkspaceDocumentNotFoundError) {
			return apiError(requestId, 404, "NOT_FOUND", "This document no longer exists.");
		}

		return apiFailure({
			cause: error,
			code: "EXPORT_FAILED",
			message: "Unable to export this document as PDF.",
			request,
			requestId,
			status: 500,
		});
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/documents/$itemId/pdf")({
	server: {
		handlers: {
			GET: ({ params, request }) =>
				handleWorkspaceDocumentPdf(request, params.workspaceId, params.itemId),
		},
	},
});

function getAttachmentHeader(fileName: string) {
	const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export { handleWorkspaceDocumentPdf };
