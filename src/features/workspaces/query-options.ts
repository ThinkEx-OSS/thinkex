import { queryOptions } from "@tanstack/react-query";

import { workspacePageQueryKey, workspacesQueryKey } from "#/features/workspaces/cache";
import { getWorkspacePageFn, listWorkspacesFn } from "#/features/workspaces/server/functions";

export function workspacesQueryOptions() {
	return queryOptions({
		queryKey: workspacesQueryKey,
		queryFn: () => listWorkspacesFn(),
	});
}

export function workspacePageQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: workspacePageQueryKey(workspaceId),
		queryFn: () => getWorkspacePageFn({ data: { workspaceId } }),
		staleTime: 10_000,
	});
}
