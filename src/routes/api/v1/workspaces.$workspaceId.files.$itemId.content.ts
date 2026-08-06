import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { readWorkspaceKernelFileSource } from "#/features/workspaces/kernel/workspace-kernel-access";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, apiFailure, getRequestId } from "#/lib/api/http";
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

		const source = await readWorkspaceKernelFileSource({
			workspaceId,
			userId: session.user.id,
			itemId,
		});
		const object = await env.WORKSPACE_KERNEL_FILES.get(source.objectKey);

		if (!object) {
			return apiError(requestId, 404, "FILE_NOT_FOUND", "Unable to load this workspace file.");
		}

		return new Response(object.body, {
			headers: {
				"cache-control": "private, max-age=60",
				"content-disposition": `inline; filename="${sanitizeHeaderFileName(source.fileName)}"`,
				"content-length": String(object.size),
				"content-type": source.contentType,
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

		return apiFailure({
			cause: error,
			code: "FILE_LOAD_FAILED",
			message: "Unable to load this workspace file.",
			request,
			requestId,
			status: 500,
		});
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
