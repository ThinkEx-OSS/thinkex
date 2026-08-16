import { getWorkspacePromptScope } from "#/features/workspaces/ai/ai-thread-prompt-scope";
import { ChatThreadOwnershipError, ensureThread } from "#/features/workspaces/ai/chat/chat-store";
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

// Authorize one chat-attachment request: session + workspace membership, then
// materialize the thread row (attachments upload to drafts before any message
// exists; the row is invisible in the sidebar until the first message —
// listThreadSummaries filters on message existence). Ownership of an existing
// thread is enforced by ensureThread's user-scoped lookup.
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
		await getWorkspacePromptScope({ userId, workspaceId: scope.workspaceId });
		await ensureThread({ threadId: scope.threadId, userId, workspaceId: scope.workspaceId });
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError || error instanceof ChatThreadOwnershipError) {
			return apiError(requestId, 404, "THREAD_NOT_FOUND", "Chat thread not found.");
		}

		throw error;
	}

	return { requestId, userId };
}
