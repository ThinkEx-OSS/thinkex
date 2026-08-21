import { queryOptions } from "@tanstack/react-query";

import {
	getAiChatThreadTranscriptFn,
	listAiChatThreadsFn,
} from "#/features/workspaces/ai/chat/functions";

export function aiChatThreadsQueryKey(workspaceId: string) {
	return ["ai-chat-threads", workspaceId] as const;
}

export function aiChatThreadTranscriptQueryKey(threadId: string) {
	return ["ai-chat-thread-transcript", threadId] as const;
}

export function aiChatThreadsQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: aiChatThreadsQueryKey(workspaceId),
		queryFn: () => listAiChatThreadsFn({ data: { workspaceId } }),
		// Mutations invalidate explicitly; don't refetch on every mount/focus tick.
		staleTime: 15_000,
	});
}

export function aiChatThreadTranscriptQueryOptions(threadId: string) {
	return queryOptions({
		queryKey: aiChatThreadTranscriptQueryKey(threadId),
		queryFn: () => getAiChatThreadTranscriptFn({ data: { threadId } }),
		refetchInterval: (query) => (query.state.data?.isTurnActive ? 1_000 : false),
		// A remount during a live server turn polls until its durable assistant
		// row lands. Idle transcripts stay fresh long enough to avoid noisy reads.
		staleTime: 30_000,
	});
}
