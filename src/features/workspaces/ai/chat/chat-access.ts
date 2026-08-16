import { getWorkspacePromptScope } from "#/features/workspaces/ai/ai-thread-prompt-scope";
import { ChatRequestError } from "#/features/workspaces/ai/chat/chat-errors";
import {
	ensureThread,
	getThread,
	type AiChatThreadRow,
} from "#/features/workspaces/ai/chat/chat-store";
import type { AIThreadPromptScope } from "#/features/workspaces/ai/ai-thread-metadata";

// The one gate every chat entry point goes through. Access to a thread is
// three checks, and skipping any of them has bitten us before:
//   1. ownership   — the thread row is the caller's (user-scoped lookup)
//   2. binding     — the thread belongs to the workspace the caller named,
//                    or, when no workspace is named, membership is checked
//                    against the thread's own workspace
//   3. membership  — the caller is CURRENTLY a member of that workspace
//                    (thread ownership alone must not outlive removal from a
//                    shared workspace whose content the transcript quotes)
//
// `mode` decides whether a missing row is created: only the turn endpoint and
// the attachment upload materialize draft threads; every read-shaped caller
// must not (a GET that inserts rows is how we minted invisible thread spam).

interface ThreadAccessResult {
	promptScope: AIThreadPromptScope;
	thread: AiChatThreadRow;
}

export async function requireThreadAccess(input: {
	threadId: string;
	userId: string;
	// The workspace the caller claims; omit when the caller only knows the
	// thread id (membership is then checked against the thread's workspace).
	workspaceId?: string;
	mode: "read" | "create-draft";
}): Promise<ThreadAccessResult> {
	if (input.mode === "create-draft") {
		if (!input.workspaceId) {
			throw new ChatRequestError(400, "workspaceId is required");
		}

		// Membership before materialization: a non-member must not create rows.
		const promptScope = await getWorkspacePromptScope({
			userId: input.userId,
			workspaceId: input.workspaceId,
		});
		const thread = await ensureThread({
			threadId: input.threadId,
			userId: input.userId,
			workspaceId: input.workspaceId,
		});

		if (thread.workspaceId !== input.workspaceId) {
			throw new ChatRequestError(409, "Thread belongs to a different workspace");
		}

		return { promptScope, thread };
	}

	const thread = await getThread({ threadId: input.threadId, userId: input.userId });

	if (!thread || (input.workspaceId && thread.workspaceId !== input.workspaceId)) {
		throw new ChatRequestError(404, "Chat thread not found");
	}

	const promptScope = await getWorkspacePromptScope({
		userId: input.userId,
		workspaceId: thread.workspaceId,
	});

	return { promptScope, thread };
}
