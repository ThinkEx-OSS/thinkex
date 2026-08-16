import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
	aiChatThreadMessagesQueryKey,
	aiChatThreadsQueryOptions,
} from "#/features/workspaces/ai/chat/chat-queries";
import { deleteAiChatThreadFn } from "#/features/workspaces/ai/chat/functions";

interface UseWorkspaceAiChatThreadsOptions {
	workspaceId: string;
}

// Thread directory over react-query, matching the workspace feature's data
// conventions. Threads are never created from here — "new chat" is a client
// draft and the row materializes on first message, which invalidates the
// threads query (see useWorkspaceAiChat). Focus refetch is react-query's
// default behavior.
export function useWorkspaceAiChatThreads({ workspaceId }: UseWorkspaceAiChatThreadsOptions) {
	const queryClient = useQueryClient();
	const threadsQuery = useQuery(aiChatThreadsQueryOptions(workspaceId));
	const deleteThreadMutation = useMutation({
		mutationFn: (threadId: string) => deleteAiChatThreadFn({ data: { threadId } }),
		onSuccess: (_result, threadId) => {
			queryClient.setQueryData(aiChatThreadsQueryOptions(workspaceId).queryKey, (current) =>
				current?.filter((thread) => thread.id !== threadId),
			);
			queryClient.removeQueries({ queryKey: aiChatThreadMessagesQueryKey(threadId) });
			// A refetch that started before the delete would resolve with the
			// pre-delete list and resurrect the thread over the local filter above;
			// invalidating cancels it and fetches fresh.
			void queryClient.invalidateQueries({
				queryKey: aiChatThreadsQueryOptions(workspaceId).queryKey,
			});
		},
	});

	return {
		deleteThread: deleteThreadMutation.mutateAsync,
		// Not isSuccess: a failed load must surface as ready-with-empty-list (the
		// panel renders and errors elsewhere), not as an eternal skeleton.
		isReady: !threadsQuery.isPending,
		threads: threadsQuery.data ?? [],
	};
}
