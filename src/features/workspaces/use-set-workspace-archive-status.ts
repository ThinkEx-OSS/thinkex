import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { workspacesQueryKey } from "#/features/workspaces/cache-keys";
import { updateWorkspaceInCaches } from "#/features/workspaces/cache-workspace";
import type { SetWorkspaceArchiveStatusInput } from "#/features/workspaces/contracts";
import { setWorkspaceArchiveStatusFn } from "#/features/workspaces/server/functions";
import { getErrorMessage } from "#/lib/error-message";

export function useSetWorkspaceArchiveStatusMutation() {
	const setWorkspaceArchiveStatus = useServerFn(setWorkspaceArchiveStatusFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: SetWorkspaceArchiveStatusInput) =>
			setWorkspaceArchiveStatus({ data: input }),
		onMutate: async () => {
			await queryClient.cancelQueries({ queryKey: workspacesQueryKey });
		},
		onSuccess: (workspace, input) => {
			updateWorkspaceInCaches(queryClient, workspace);
			toast.success(input.status === "archived" ? "Workspace archived." : "Workspace restored.");
		},
		onError: (error, input) => {
			toast.error(
				getErrorMessage(
					error,
					input.status === "archived"
						? "Unable to archive workspace right now."
						: "Unable to restore workspace right now.",
				),
			);
		},
	});
}
