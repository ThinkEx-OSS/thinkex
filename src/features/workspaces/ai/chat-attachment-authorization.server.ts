import { requireThreadAccess } from "#/features/workspaces/ai/chat/chat-access";
import { ChatRequestError } from "#/features/workspaces/ai/chat/chat-errors";
import { ChatThreadOwnershipError } from "#/features/workspaces/ai/chat/chat-store";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { apiError, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

interface ChatAttachmentScope {
	threadId: string;
	workspaceId: string;
}

interface AuthorizedChatAttachmentRequest {
	requestId: string;
	userId: string;
}

// Authorize one chat-attachment request through the canonical thread gate:
// session, current workspace membership, thread ownership, AND the thread's
// workspace binding (a thread from workspace A must not be reachable through
// a workspace-B URL). Only uploads materialize the draft thread row —
// attachments upload to drafts before any message exists — read and delete
// requests must never create rows.
export async function authorizeChatAttachmentRequest(
	request: Request,
	scope: ChatAttachmentScope,
): Promise<AuthorizedChatAttachmentRequest | Response> {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);

	if (!session) {
		return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	}

	const userId = session.user.id;

	try {
		await requireThreadAccess({
			threadId: scope.threadId,
			userId,
			workspaceId: scope.workspaceId,
			mode: request.method === "POST" ? "create-draft" : "read",
		});
	} catch (error) {
		if (
			error instanceof WorkspaceForbiddenError ||
			error instanceof ChatThreadOwnershipError ||
			error instanceof ChatRequestError
		) {
			return apiError(requestId, 404, "THREAD_NOT_FOUND", "Chat thread not found.");
		}

		throw error;
	}

	return { requestId, userId };
}
