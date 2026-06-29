import { createFileRoute } from "@tanstack/react-router";
import { WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } from "#/features/workspaces/files/workspace-file-preview.constants";
import { readWorkspaceKernelFilePreview } from "#/features/workspaces/kernel/workspace-kernel-access";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

async function handleWorkspaceFilePreview(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);

	try {
		const session = await getSessionFromRequest(request);

		if (!session) {
			return apiError(
				requestId,
				401,
				"UNAUTHORIZED",
				"You must be signed in to view workspace file previews.",
			);
		}

		const preview = await readWorkspaceKernelFilePreview({
			workspaceId,
			userId: session.user.id,
			itemId,
		});

		if (!preview || preview.status !== "ready" || !preview.bytes) {
			return apiError(
				requestId,
				404,
				"PREVIEW_NOT_FOUND",
				"Preview is not available for this workspace file yet.",
			);
		}

		const body = new Uint8Array(preview.bytes).buffer;
		const cacheKey = preview.sourceHash ?? preview.updatedAt;
		const headers = {
			"cache-control": "private, max-age=86400, immutable",
			"content-length": String(body.byteLength),
			"content-type": preview.contentType || WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
			etag: `"${cacheKey}"`,
			"x-request-id": requestId,
		};

		return new Response(body, { headers });
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
			"PREVIEW_NOT_FOUND",
			"Unable to load this workspace file preview.",
			error instanceof Error ? { message: error.message } : undefined,
		);
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/files/$itemId/preview")({
	server: {
		handlers: {
			GET: ({ params, request }) =>
				handleWorkspaceFilePreview(request, params.workspaceId, params.itemId),
		},
	},
});

export { handleWorkspaceFilePreview };
