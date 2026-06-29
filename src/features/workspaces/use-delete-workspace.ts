import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { removeWorkspaceCaches, workspacesQueryKey } from "#/features/workspaces/cache";
import type { DeleteWorkspaceInput, WorkspaceSummary } from "#/features/workspaces/contracts";
import { deleteWorkspaceFn } from "#/features/workspaces/server/functions";
import { getErrorMessage } from "#/lib/error-message";

export function useDeleteWorkspaceMutation() {
	const deleteWorkspace = useServerFn(deleteWorkspaceFn);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: DeleteWorkspaceInput) => deleteWorkspace({ data: input }),
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: workspacesQueryKey });

			const previousWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(workspacesQueryKey);

			queryClient.setQueryData<WorkspaceSummary[]>(workspacesQueryKey, (current) =>
				current?.filter((workspace) => workspace.id !== input.workspaceId),
			);

			return {
				previousWorkspaces,
			};
		},
		onSuccess: async (_deletedWorkspace, input) => {
			removeWorkspaceCaches(queryClient, input.workspaceId);
			toast.success("Workspace deleted.");
			await navigate({ to: "/home" });
		},
		onError: (error, _input, context) => {
			if (context?.previousWorkspaces) {
				queryClient.setQueryData(workspacesQueryKey, context.previousWorkspaces);
			}

			toast.error(getErrorMessage(error, "Unable to delete workspace right now."));
		},
	});
}
