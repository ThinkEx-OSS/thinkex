import { createFileRoute } from "@tanstack/react-router";

import { createWorkspaceExport } from "#/features/workspaces/export/workspace-export";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, apiFailure, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

async function handleWorkspaceExport(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) {
		return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in to export a workspace.");
	}

	try {
		const archive = await createWorkspaceExport({
			workspaceId,
			userId: session.user.id,
		});
		return new Response(archive.stream, {
			headers: {
				"cache-control": "private, no-store",
				"content-disposition": getAttachmentHeader(archive.fileName),
				"content-type": "application/zip",
				"x-request-id": requestId,
			},
		});
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(
				requestId,
				403,
				"FORBIDDEN",
				"You do not have permission to export this workspace.",
			);
		}

		return apiFailure({
			cause: error,
			code: "EXPORT_FAILED",
			message: "Unable to export this workspace.",
			request,
			requestId,
			status: 500,
		});
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/export")({
	server: {
		handlers: {
			GET: ({ params, request }) => handleWorkspaceExport(request, params.workspaceId),
		},
	},
});

function getAttachmentHeader(fileName: string) {
	const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
	return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export { handleWorkspaceExport };
