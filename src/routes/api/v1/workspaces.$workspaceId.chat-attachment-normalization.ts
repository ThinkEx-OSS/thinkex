import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { createDbContext } from "#/db/server";
import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";
import { convertImageFileToJpeg } from "#/features/workspaces/conversion/image-file-converter";
import {
	getWorkspaceConvertedFileName,
	resolveWorkspaceUploadFormat,
	resolveWorkspaceUploadConversion,
} from "#/features/workspaces/model/workspace-file";
import {
	assertCanReadWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import { apiError, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";
import { fileMatchesAccept } from "#/lib/file-accept";

const fileFormKey = "file";

async function handleWorkspaceChatAttachmentNormalization(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);

	try {
		const session = await getSessionFromRequest(request);

		if (!session) {
			return apiError(
				requestId,
				401,
				"UNAUTHORIZED",
				"You must be signed in to add chat attachments.",
			);
		}

		const dbContext = await createDbContext();

		try {
			await assertCanReadWorkspace(dbContext.db, {
				workspaceId,
				userId: session.user.id,
			});
		} finally {
			await dbContext.dispose();
		}

		const formData = await request.formData();
		const file = formData.get(fileFormKey);

		if (!(file instanceof File)) {
			return apiError(requestId, 400, "INVALID_ATTACHMENT", "Attachment is missing a file.");
		}

		if (!Number.isInteger(file.size) || file.size <= 0) {
			return apiError(requestId, 400, "INVALID_ATTACHMENT", "Attachment is empty.");
		}

		if (file.size > WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFileSize) {
			return apiError(requestId, 413, "ATTACHMENT_TOO_LARGE", "Attach files up to 20 MB.");
		}

		if (!fileMatchesAccept(file, WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.accept)) {
			return apiError(
				requestId,
				400,
				"UNSUPPORTED_ATTACHMENT",
				"This kind of file can't be added to chat.",
			);
		}

		const hint = {
			fileName: file.name,
			contentType: file.type,
		};
		const conversion = resolveWorkspaceUploadConversion(hint);
		const format = resolveWorkspaceUploadFormat(hint);
		const normalized =
			conversion === "heic_to_jpeg"
				? await convertHeicAttachmentToJpeg(file)
				: {
						bytes: await file.arrayBuffer(),
						contentType: file.type || format?.mime || "application/octet-stream",
						fileName: file.name,
					};

		return new Response(normalized.bytes, {
			headers: {
				"content-type": normalized.contentType,
				"x-attachment-filename": encodeURIComponent(normalized.fileName),
				"x-request-id": requestId,
			},
		});
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(
				requestId,
				403,
				"FORBIDDEN",
				"You do not have permission to use this workspace.",
			);
		}

		if (error instanceof WorkspaceFileConversionError) {
			return apiError(requestId, 422, "CONVERSION_FAILED", error.userMessage, {
				message: error.message,
			});
		}

		return apiError(
			requestId,
			500,
			"ATTACHMENT_NORMALIZATION_FAILED",
			"Unable to prepare this attachment right now.",
			error instanceof Error ? { message: error.message } : undefined,
		);
	}
}

async function convertHeicAttachmentToJpeg(file: File) {
	const converted = await convertImageFileToJpeg(env, {
		file,
		fileName: file.name,
	});

	return {
		bytes: converted.bytes,
		contentType: converted.contentType,
		fileName: getWorkspaceConvertedFileName(file.name, "heic_to_jpeg"),
	};
}

export const Route = createFileRoute(
	"/api/v1/workspaces/$workspaceId/chat-attachment-normalization",
)({
	server: {
		handlers: {
			POST: ({ params, request }) =>
				handleWorkspaceChatAttachmentNormalization(request, params.workspaceId),
		},
	},
});

export { handleWorkspaceChatAttachmentNormalization };
