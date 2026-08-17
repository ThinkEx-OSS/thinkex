import { createFileRoute } from "@tanstack/react-router";

import { authorizeChatAttachmentRequest } from "#/features/workspaces/ai/chat-attachment-authorization.server";
import {
	deleteThreadAttachment,
	getThreadAttachment,
} from "#/features/workspaces/ai/chat/chat-store";
import { apiError } from "#/lib/api/http";

async function handleChatAttachmentContent(
	request: Request,
	identity: { attachmentId: string; threadId: string; workspaceId: string },
) {
	const authorized = await authorizeChatAttachmentRequest(request, identity);
	if (authorized instanceof Response) {
		return authorized;
	}
	const { requestId } = authorized;

	const attachment = await getThreadAttachment({
		attachmentId: identity.attachmentId,
		threadId: identity.threadId,
		userId: authorized.userId,
	});

	if (!attachment) {
		return apiError(requestId, 404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");
	}

	return new Response(request.method === "HEAD" ? null : (attachment.bytes as BodyInit), {
		headers: {
			// Attachment content is immutable once stored; let the browser cache it
			// so each image render doesn't repeat the authorized DB fetch.
			"cache-control": "private, max-age=31536000, immutable",
			"content-type": attachment.mediaType,
			"x-content-type-options": "nosniff",
			"x-request-id": requestId,
		},
	});
}

async function handleChatAttachmentDelete(
	request: Request,
	identity: { attachmentId: string; threadId: string; workspaceId: string },
) {
	const authorized = await authorizeChatAttachmentRequest(request, identity);
	if (authorized instanceof Response) {
		return authorized;
	}

	await deleteThreadAttachment({
		attachmentId: identity.attachmentId,
		threadId: identity.threadId,
		userId: authorized.userId,
	});
	return new Response(null, { status: 204 });
}

export const Route = createFileRoute(
	"/api/v1/workspaces/$workspaceId/ai-threads/$threadId/attachments/$attachmentId",
)({
	server: {
		handlers: {
			DELETE: ({ params, request }) => handleChatAttachmentDelete(request, params),
			GET: ({ params, request }) => handleChatAttachmentContent(request, params),
			HEAD: ({ params, request }) => handleChatAttachmentContent(request, params),
		},
	},
});
