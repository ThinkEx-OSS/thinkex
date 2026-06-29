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
