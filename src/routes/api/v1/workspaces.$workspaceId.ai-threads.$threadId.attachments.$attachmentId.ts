import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { authorizeChatAttachmentRequest } from "#/features/workspaces/ai/chat-attachment-authorization.server";
import { getChatAttachmentObjectKey } from "#/features/workspaces/ai/chat-attachment-storage";
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

	const object = await env.WORKSPACE_KERNEL_FILES.get(
		getChatAttachmentObjectKey({ ...identity, userId: authorized.userId }),
	);

	if (!object) {
		return apiError(requestId, 404, "ATTACHMENT_NOT_FOUND", "Attachment not found.");
	}

	const headers = new Headers({
		"cache-control": "private, no-store",
		"x-content-type-options": "nosniff",
		"x-request-id": requestId,
	});
	object.writeHttpMetadata(headers);

	return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function handleChatAttachmentDelete(
	request: Request,
	identity: { attachmentId: string; threadId: string; workspaceId: string },
) {
	const authorized = await authorizeChatAttachmentRequest(request, identity);
	if (authorized instanceof Response) {
		return authorized;
	}

	await env.WORKSPACE_KERNEL_FILES.delete(
		getChatAttachmentObjectKey({ ...identity, userId: authorized.userId }),
	);
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

export { handleChatAttachmentContent };
