import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
	restoreWorkspaceListCache,
	seedWorkspaceCaches,
	workspacesQueryKey,
} from "#/features/workspaces/cache";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { WORKSPACE_ROOT_VIEW } from "#/features/workspaces/model/tabs";
import { createWorkspaceFn } from "#/features/workspaces/server/functions";
import { getErrorMessage } from "#/lib/error-message";

export function useCreateWorkspaceMutation() {
	const createWorkspace = useServerFn(createWorkspaceFn);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => createWorkspace({ data: {} }),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: workspacesQueryKey });

			const previousWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(workspacesQueryKey);

			return {
				previousWorkspaces,
			};
		},
		onSuccess: (workspace) => {
			seedWorkspaceCaches(queryClient, {
				workspace,
				items: [],
			});

			void navigate({
				to: "/workspaces/$workspaceId",
				params: { workspaceId: workspace.id },
				search: {
					tab: undefined,
					view: WORKSPACE_ROOT_VIEW,
				},
			});
		},
		onError: (error, _variables, context) => {
			restoreWorkspaceListCache(queryClient, context?.previousWorkspaces);

			void navigate({ to: "/home" });
			toast.error(getErrorMessage(error, "Unable to create workspace right now."));
		},
	});
}
