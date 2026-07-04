import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
	removeWorkspaceDetailCaches,
	restoreWorkspaceListCache,
	setWorkspacePageCache,
	updateWorkspaceInCaches,
	upsertWorkspaceInList,
	workspacesQueryKey,
} from "#/features/workspaces/cache";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import {
	DEFAULT_WORKSPACE_COLOR,
	DEFAULT_WORKSPACE_ICON,
	DEFAULT_WORKSPACE_NAME,
} from "#/features/workspaces/defaults";
import { WORKSPACE_ROOT_VIEW } from "#/features/workspaces/model/tabs";
import { createWorkspaceFn } from "#/features/workspaces/server/functions";
import { markWorkspaceCreatedThisSession } from "#/features/workspaces/use-record-workspace-opened";
import { getErrorMessage } from "#/lib/error-message";

interface CreateWorkspaceVariables {
	id: string;
}

export function useCreateWorkspaceMutation() {
	const createWorkspace = useServerFn(createWorkspaceFn);
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id }: CreateWorkspaceVariables) => createWorkspace({ data: { id } }),
		// The workspace id is minted on the client so we can navigate into the new
		// workspace immediately (showing its skeleton) instead of waiting for the
		// server round-trip. The kernel, chat, and file storage are all addressed
		// lazily by this id, so a client-generated uuid is safe.
		onMutate: async ({ id }) => {
			await queryClient.cancelQueries({ queryKey: workspacesQueryKey });

			const previousWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(workspacesQueryKey);
			const now = new Date().toISOString();
			const optimisticWorkspace: WorkspaceSummary = {
				id,
				name: DEFAULT_WORKSPACE_NAME,
				description: null,
				icon: DEFAULT_WORKSPACE_ICON,
				color: DEFAULT_WORKSPACE_COLOR,
				createdAt: now,
				updatedAt: now,
				lastOpenedAt: now,
				archivedAt: null,
				membershipRole: "owner",
			};

			upsertWorkspaceInList(queryClient, optimisticWorkspace);
			setWorkspacePageCache(queryClient, { workspace: optimisticWorkspace, items: [] });
			markWorkspaceCreatedThisSession(id);

			void navigate({
				to: "/workspaces/$workspaceId",
				params: { workspaceId: id },
				search: {
					tab: undefined,
					view: WORKSPACE_ROOT_VIEW,
				},
			});

			return { previousWorkspaces, id };
		},
		onSuccess: (workspace) => {
			// Replace the optimistic summary with the authoritative one. Reuses the
			// canonical updater so the page's items are left untouched (never wiped).
			updateWorkspaceInCaches(queryClient, workspace);
		},
		onError: (error, _variables, context) => {
			// Navigate away from the phantom workspace first, then tear down its
			// caches, so the user doesn't see a flash of skeleton before the redirect.
			void navigate({ to: "/home" });
			restoreWorkspaceListCache(queryClient, context?.previousWorkspaces);

			if (context?.id) {
				removeWorkspaceDetailCaches(queryClient, context.id);
			}

			toast.error(getErrorMessage(error, "Unable to create workspace right now."));
		},
	});
}
