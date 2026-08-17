import { queryOptions } from "@tanstack/react-query";

import {
	getAiChatThreadMessagesFn,
	listAiChatThreadsFn,
} from "#/features/workspaces/ai/chat/functions";

export function aiChatThreadsQueryKey(workspaceId: string) {
	return ["ai-chat-threads", workspaceId] as const;
}

export function aiChatThreadMessagesQueryKey(threadId: string) {
	return ["ai-chat-thread-messages", threadId] as const;
}

export function aiChatThreadsQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: aiChatThreadsQueryKey(workspaceId),
		queryFn: () => listAiChatThreadsFn({ data: { workspaceId } }),
		// Mutations invalidate explicitly; don't refetch on every mount/focus tick.
		staleTime: 15_000,
	});
}

export function aiChatThreadMessagesQueryOptions(threadId: string) {
	return queryOptions({
		queryKey: aiChatThreadMessagesQueryKey(threadId),
		queryFn: () => getAiChatThreadMessagesFn({ data: { threadId } }),
		// The live chat writes settled transcripts into this cache itself, so a
		// background refetch is only a safety net.
		staleTime: 30_000,
	});
}
