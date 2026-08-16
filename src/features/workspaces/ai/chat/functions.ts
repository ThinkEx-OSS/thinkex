import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	deleteThread,
	listThreadMessages,
	listThreadSummaries,
} from "#/features/workspaces/ai/chat/chat-store";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";

// Server functions for the chat's reads and non-streaming mutations, matching
// the workspace feature's createServerFn + react-query convention. The one
// thing that stays a raw Worker route is the chat turn itself — it streams.

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

export const listAiChatThreadsFn = createServerFn({ method: "GET" })
	.validator(workspaceIdInputSchema)
	.handler(async ({ data }) =>
		listThreadSummaries({ userId: await getCurrentUserId(), workspaceId: data.workspaceId }),
	);

export const getAiChatThreadMessagesFn = createServerFn({ method: "GET" })
	.validator(threadIdInputSchema)
	.handler(
		async ({ data }) =>
			(await listThreadMessages({
				userId: await getCurrentUserId(),
				threadId: data.threadId,
			})) as unknown as SerializedUiMessage[],
	);

export const deleteAiChatThreadFn = createServerFn({ method: "POST" })
	.validator(threadIdInputSchema)
	.handler(async ({ data }) => {
		// Messages and attachments cascade with the thread row — no side cleanup.
		await deleteThread({ threadId: data.threadId, userId: await getCurrentUserId() });

		return { ok: true };
	});
