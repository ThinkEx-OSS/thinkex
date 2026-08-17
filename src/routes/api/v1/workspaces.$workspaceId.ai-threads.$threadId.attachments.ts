import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { authorizeChatAttachmentRequest } from "#/features/workspaces/ai/chat-attachment-authorization.server";
import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { getChatAttachmentContentUrl } from "#/features/workspaces/ai/chat-attachment-storage";
import {
	ChatAttachmentLimitError,
	insertThreadAttachment,
} from "#/features/workspaces/ai/chat/chat-store";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";
import { normalizeChatImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
import {
	observeWorkspaceFileIntake,
	type WorkspaceFileIntakeObservation,
} from "#/features/workspaces/upload/workspace-file-intake-observability";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { fileMatchesAccept } from "#/lib/file-accept";

const fileFormKey = "file";

async function handleChatAttachmentUpload(request: Request, workspaceId: string, threadId: string) {
	const requestId = getRequestId(request);
	return observeWorkspaceFileIntake({
		kind: "chat_attachment",
		request,
		requestId,
		run: (observation) =>
			executeChatAttachmentUpload(request, workspaceId, threadId, requestId, observation),
		workspaceId,
	});
}

async function executeChatAttachmentUpload(
	request: Request,
	workspaceId: string,
	threadId: string,
	requestId: string,
	observation: WorkspaceFileIntakeObservation,
) {
	try {
		const authorized = await authorizeChatAttachmentRequest(request, { threadId, workspaceId });
		if (authorized instanceof Response) {
			return authorized;
		}
		observation.userId = authorized.userId;

		const formData = await request.formData();
		const file = formData.get(fileFormKey);

		if (!(file instanceof File)) {
			return apiError(requestId, 400, "INVALID_ATTACHMENT", "Attachment is missing a file.");
		}
		observation.inputBytes = file.size;
		observation.plan = "file";

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

		const normalized = await normalizeChatImageToJpeg(
			env,
			file.stream(),
			WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxNormalizedFileSize,
		);
		observation.conversion = "image_to_jpeg";
		observation.outputBytes = normalized.sizeBytes;

		const attachmentId = crypto.randomUUID();
		const fileName = replaceFileExtension(file.name, "jpg");
		await insertThreadAttachment({
			id: attachmentId,
			threadId,
			mediaType: normalized.contentType,
			fileName,
			bytes: new Uint8Array(normalized.bytes),
		});

		return apiJson(
			{
				fileName,
				mediaType: normalized.contentType,
				url: getChatAttachmentContentUrl({ attachmentId, threadId, workspaceId }),
			},
			requestId,
		);
	} catch (error) {
		observation.error = error;
		if (error instanceof ChatAttachmentLimitError) {
			return apiError(requestId, 413, "ATTACHMENT_LIMIT", "This chat has too many attachments.");
		}
		if (error instanceof WorkspaceFileConversionError) {
			if (error.failure === "output_too_large") {
				return apiError(
					requestId,
					413,
					"ATTACHMENT_TOO_LARGE",
					"This image is too detailed to attach after optimization.",
				);
			}
			return apiError(requestId, 422, "CONVERSION_FAILED", error.userMessage);
		}

		return apiError(
			requestId,
			500,
			"ATTACHMENT_UPLOAD_FAILED",
			"Unable to prepare this attachment right now.",
		);
	}
}

function replaceFileExtension(fileName: string, extension: string) {
	const stem = fileName.replace(/\.[^./\\]+$/, "");
	return `${stem || "image"}.${extension}`;
}

export const Route = createFileRoute(
	"/api/v1/workspaces/$workspaceId/ai-threads/$threadId/attachments",
)({
	server: {
		handlers: {
			POST: ({ params, request }) =>
				handleChatAttachmentUpload(request, params.workspaceId, params.threadId),
		},
	},
});

export { handleChatAttachmentUpload };
