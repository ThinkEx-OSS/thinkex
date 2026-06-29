import { createFileRoute } from "@tanstack/react-router";

import { readWorkspaceKernelFileContent } from "#/features/workspaces/kernel/workspace-kernel-access";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

async function handleWorkspaceFileContent(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);

	try {
		const session = await getSessionFromRequest(request);

		if (!session) {
			return apiError(
				requestId,
				401,
				"UNAUTHORIZED",
				"You must be signed in to view workspace files.",
			);
		}

		const content = await readWorkspaceKernelFileContent({
			workspaceId,
			userId: session.user.id,
			itemId,
		});
		const body = new Uint8Array(content.bytes).buffer;

		return new Response(body, {
			headers: {
				"cache-control": "private, max-age=60",
				"content-disposition": `inline; filename="${sanitizeHeaderFileName(content.fileName)}"`,
				"content-length": String(body.byteLength),
				"content-type": content.contentType,
				"x-request-id": requestId,
			},
		});
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(
				requestId,
				403,
				"FORBIDDEN",
				"You do not have permission to view files in this workspace.",
			);
		}

		return apiError(
			requestId,
			404,
			"FILE_NOT_FOUND",
			"Unable to load this workspace file.",
			error instanceof Error ? { message: error.message } : undefined,
		);
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/files/$itemId/content")({
	server: {
		handlers: {
			GET: ({ params, request }) =>
				handleWorkspaceFileContent(request, params.workspaceId, params.itemId),
		},
	},
});

function sanitizeHeaderFileName(fileName: string) {
	return fileName.replace(/["\r\n\\]/g, "_");
}

export { handleWorkspaceFileContent };
