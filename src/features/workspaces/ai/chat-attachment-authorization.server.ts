import { env } from "cloudflare:workers";
import { getAgentByName } from "agents";

import type { UserAIStore } from "#/features/workspaces/ai/user-ai-agents";
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

export async function authorizeChatAttachmentRequest(
	request: Request,
	scope: ChatAttachmentScope,
): Promise<AuthorizedChatAttachmentRequest | Response> {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);

	if (!session) {
		return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	}

	const directory = await getAgentByName<Cloudflare.Env, UserAIStore>(
		env.UserAIStore,
		session.user.id,
	);
	const thread = await directory.getThreadContext(scope.threadId);

	if (thread?.workspaceId !== scope.workspaceId) {
		return apiError(requestId, 404, "THREAD_NOT_FOUND", "Chat thread not found.");
	}

	return { requestId, userId: session.user.id };
}
