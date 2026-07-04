import type { QueryClient } from "@tanstack/react-query";
import { workspacePageQueryKey, workspacesQueryKey } from "#/features/workspaces/cache-keys";
import type {
	WorkspaceItemSummary,
	WorkspacePage,
	WorkspaceSummary,
} from "#/features/workspaces/contracts";

type WorkspaceListCacheMode = "upsert" | "update-existing";

// Insert or refresh a workspace's entry in the list cache.
// - "upsert": add it if missing (used when a workspace is created).
// - "update-existing": only touch it if the list is already loaded; never
//   fabricate a single-item list, which would make /home briefly render just
//   one workspace before the real list arrives.
export function upsertWorkspaceInList(
	queryClient: QueryClient,
	workspace: WorkspaceSummary,
	mode: WorkspaceListCacheMode = "upsert",
) {
	queryClient.setQueryData<WorkspaceSummary[]>(workspacesQueryKey, (current) => {
		if (!current) {
			return mode === "update-existing" ? undefined : [workspace];
		}

		if (current.some((item) => item.id === workspace.id)) {
			return current
				.map((item) => (item.id === workspace.id ? workspace : item))
				.sort(compareWorkspaceRecentFirst);
		}

		return [workspace, ...current].sort(compareWorkspaceRecentFirst);
	});
}

export function setWorkspacePageCache(
	queryClient: QueryClient,
	input: { workspace: WorkspaceSummary; items: WorkspaceItemSummary[]; revision?: number },
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(input.workspace.id), (current) => ({
		workspace: input.workspace,
		items: input.items,
		revision: input.revision ?? current?.revision ?? 0,
	}));
}

export function restoreWorkspaceListCache(
	queryClient: QueryClient,
	workspaces: WorkspaceSummary[] | undefined,
) {
	if (workspaces) {
		queryClient.setQueryData(workspacesQueryKey, workspaces);
		return;
	}

	queryClient.removeQueries({ queryKey: workspacesQueryKey });
}

export function removeWorkspaceFromListCache(queryClient: QueryClient, workspaceId: string) {
	const previousWorkspaces = queryClient.getQueryData<WorkspaceSummary[]>(workspacesQueryKey);

	queryClient.setQueryData<WorkspaceSummary[]>(workspacesQueryKey, (current) =>
		current?.filter((workspace) => workspace.id !== workspaceId),
	);

	return previousWorkspaces;
}

export function markWorkspaceOpenedInCache(
	queryClient: QueryClient,
	workspaceId: string,
	openedAt: string,
) {
	const updateWorkspace = (workspace: WorkspaceSummary) =>
		workspace.id === workspaceId ? { ...workspace, lastOpenedAt: openedAt } : workspace;

	queryClient.setQueryData<WorkspaceSummary[]>(workspacesQueryKey, (current) =>
		current?.map(updateWorkspace).sort(compareWorkspaceRecentFirst),
	);
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(workspaceId), (current) =>
		current
			? {
					...current,
					workspace: updateWorkspace(current.workspace),
				}
			: current,
	);
}

export function updateWorkspaceInCaches(queryClient: QueryClient, workspace: WorkspaceSummary) {
	upsertWorkspaceInList(queryClient, workspace, "update-existing");
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(workspace.id), (current) =>
		current
			? {
					...current,
					workspace,
				}
			: current,
	);
}

export function removeWorkspaceCaches(queryClient: QueryClient, workspaceId: string) {
	removeWorkspaceFromListCache(queryClient, workspaceId);
	removeWorkspaceDetailCaches(queryClient, workspaceId);
}

export function removeWorkspaceDetailCaches(queryClient: QueryClient, workspaceId: string) {
	queryClient.removeQueries({ queryKey: workspacePageQueryKey(workspaceId) });
}

function compareWorkspaceRecentFirst(left: WorkspaceSummary, right: WorkspaceSummary) {
	const leftRecentAt = left.lastOpenedAt ?? left.createdAt;
	const rightRecentAt = right.lastOpenedAt ?? right.createdAt;
	const recentDelta = rightRecentAt.localeCompare(leftRecentAt);

	if (recentDelta !== 0) {
		return recentDelta;
	}

	return left.name.localeCompare(right.name);
}
