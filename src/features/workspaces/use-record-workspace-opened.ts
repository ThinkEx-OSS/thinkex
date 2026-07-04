import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
	markWorkspaceOpenedInCache,
	workspacePageQueryKey,
	workspacesQueryKey,
} from "#/features/workspaces/cache";
import type { WorkspacePage, WorkspaceSummary } from "#/features/workspaces/contracts";
import { recordWorkspaceOpenedFn } from "#/features/workspaces/server/functions";

interface RecordWorkspaceOpenedVariables {
	workspaceId: string;
}

// A workspace created this session already has `lastOpenedAt` stamped by the
// server at creation time. This one-shot handoff lets the create flow tell
// WorkspacePageRoute to skip only its *initial* "record opened" call, which
// would otherwise race the insert and fire a doomed request. Later reopens are
// unaffected and still bump recency.
const workspacesCreatedThisSession = new Set<string>();

export function markWorkspaceCreatedThisSession(workspaceId: string) {
	workspacesCreatedThisSession.add(workspaceId);
}

export function consumeInitialOpenRecordSkip(workspaceId: string) {
	return workspacesCreatedThisSession.delete(workspaceId);
}

export function useRecordWorkspaceOpenedMutation() {
	const recordWorkspaceOpened = useServerFn(recordWorkspaceOpenedFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ workspaceId }: RecordWorkspaceOpenedVariables) =>
			recordWorkspaceOpened({ data: { workspaceId } }),
		onMutate: async ({ workspaceId }) => {
			await queryClient.cancelQueries({ queryKey: workspacesQueryKey });

			const openedAt = new Date().toISOString();
			const previousWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(workspacesQueryKey);
			const previousPage = queryClient.getQueryData<WorkspacePage>(
				workspacePageQueryKey(workspaceId),
			);

			markWorkspaceOpenedInCache(queryClient, workspaceId, openedAt);

			return {
				previousWorkspaces,
				previousPage,
			};
		},
		onSuccess: (workspace, { workspaceId }) => {
			if (workspace?.lastOpenedAt) {
				markWorkspaceOpenedInCache(queryClient, workspaceId, workspace.lastOpenedAt);
			}
		},
		onError: (_error, { workspaceId }, context) => {
			if (context?.previousWorkspaces) {
				queryClient.setQueryData(workspacesQueryKey, context.previousWorkspaces);
			}

			if (context?.previousPage) {
				queryClient.setQueryData(workspacePageQueryKey(workspaceId), context.previousPage);
			}
		},
	});
}
