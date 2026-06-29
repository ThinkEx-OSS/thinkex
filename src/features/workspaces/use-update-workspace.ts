import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
	updateWorkspaceInCaches,
	workspacePageQueryKey,
	workspacesQueryKey,
} from "#/features/workspaces/cache";
import type {
	UpdateWorkspaceInput,
	WorkspacePage,
	WorkspaceSummary,
} from "#/features/workspaces/contracts";
import { updateWorkspaceFn } from "#/features/workspaces/server/functions";
import { getErrorMessage } from "#/lib/error-message";

export function useUpdateWorkspaceMutation() {
	const updateWorkspace = useServerFn(updateWorkspaceFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateWorkspaceInput) => updateWorkspace({ data: input }),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: workspacesQueryKey });

			const previousWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(workspacesQueryKey);
			const previousPage = queryClient.getQueryData<WorkspacePage>(
				workspacePageQueryKey(input.workspaceId),
			);
			const currentWorkspace =
				previousWorkspaces?.find((workspace) => workspace.id === input.workspaceId) ??
				previousPage?.workspace;

			if (currentWorkspace) {
				updateWorkspaceInCaches(queryClient, {
					...currentWorkspace,
					name: input.name,
					icon: input.icon,
					color: input.color,
				});
			}

			return {
				previousWorkspaces,
				previousPage,
			};
		},
		onSuccess: (workspace) => {
			updateWorkspaceInCaches(queryClient, workspace);
			toast.success("Workspace updated.");
		},
		onError: (error, input, context) => {
			if (context?.previousWorkspaces) {
				queryClient.setQueryData(workspacesQueryKey, context.previousWorkspaces);
			}

			if (context?.previousPage) {
				queryClient.setQueryData(workspacePageQueryKey(input.workspaceId), context.previousPage);
			}

			toast.error(getErrorMessage(error, "Unable to update workspace right now."));
		},
	});
}
