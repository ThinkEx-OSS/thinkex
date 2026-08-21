import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getWorkspacePromptScope } from "#/features/workspaces/ai/ai-thread-prompt-scope";
import { requireThreadAccess } from "#/features/workspaces/ai/chat/chat-access";
import { ChatRequestError } from "#/features/workspaces/ai/chat/chat-errors";
import {
	deleteThread,
	getThreadTranscript,
	listThreadSummaries,
} from "#/features/workspaces/ai/chat/chat-store";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";

// Server functions for the chat's reads and non-streaming mutations, matching
// the workspace feature's createServerFn + react-query convention. The one
// thing that stays a raw Worker route is the chat turn itself — it streams.
//
// Every handler checks CURRENT workspace membership, not just thread
// ownership: transcripts quote shared workspace content, so removal from a
// workspace must revoke transcript access too.

const workspaceIdInputSchema = z.object({ workspaceId: z.string().min(1) });
const threadIdInputSchema = z.object({ threadId: z.string().min(1) });

// Server functions must return provably-serializable values, and the AI SDK's
// UIMessage carries `unknown`s the validator rejects. Messages are plain JSON
// rows in Postgres, so the wire type states exactly that; the client casts
// back to UIMessage at its boundary.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface SerializedUiMessage {
	id: string;
	role: "user" | "assistant" | "system";
	parts: Json[];
	metadata?: Json;
}

export interface SerializedAiChatThreadTranscript {
	isTurnActive: boolean;
	messages: SerializedUiMessage[];
}

export const listAiChatThreadsFn = createServerFn({ method: "GET" })
	.validator(workspaceIdInputSchema)
	.handler(async ({ data }) => {
		const userId = await getCurrentUserId();
		await getWorkspacePromptScope({ userId, workspaceId: data.workspaceId });

		return listThreadSummaries({ userId, workspaceId: data.workspaceId });
	});

export const getAiChatThreadTranscriptFn = createServerFn({ method: "GET" })
	.validator(threadIdInputSchema)
	.handler(async ({ data }) => {
		const userId = await getCurrentUserId();
		// A draft thread has no row yet; an empty transcript is the right answer
		// for it, so a missing thread is not an error here — but an existing
		// thread requires current membership in its workspace.
		await requireThreadAccess({ threadId: data.threadId, userId, mode: "read" }).catch((error) => {
			if (isMissingThread(error)) {
				return;
			}
			throw error;
		});

		return (await getThreadTranscript({
			userId,
			threadId: data.threadId,
		})) as unknown as SerializedAiChatThreadTranscript;
	});

export const deleteAiChatThreadFn = createServerFn({ method: "POST" })
	.validator(threadIdInputSchema)
	.handler(async ({ data }) => {
		const userId = await getCurrentUserId();
		await requireThreadAccess({ threadId: data.threadId, userId, mode: "read" });
		// Messages and attachments cascade with the thread row — no side cleanup.
		await deleteThread({ threadId: data.threadId, userId });

		return { ok: true };
	});

function isMissingThread(error: unknown) {
	return error instanceof ChatRequestError && error.status === 404;
}
