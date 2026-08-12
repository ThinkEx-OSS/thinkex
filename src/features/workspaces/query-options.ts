import { queryOptions, replaceEqualDeep } from "@tanstack/react-query";

import { workspacePageQueryKey, workspacesQueryKey } from "#/features/workspaces/cache";
import { getWorkspacePageFn, listWorkspacesFn } from "#/features/workspaces/server/functions";

type WorkspacePageQueryResult = Awaited<ReturnType<typeof getWorkspacePageFn>>;

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
		structuralSharing: (current, incoming) => {
			// TanStack exposes this commit-time boundary as unknown even though the
			// query function above owns the result type.
			const currentPage = current as WorkspacePageQueryResult | undefined;
			const incomingPage = incoming as WorkspacePageQueryResult;
			return currentPage && incomingPage && currentPage.revision > incomingPage.revision
				? currentPage
				: replaceEqualDeep(currentPage, incomingPage);
		},
		staleTime: 10_000,
	});
}
