import { queryOptions } from "@tanstack/react-query";

import { workspacePageQueryKey, workspacesQueryKey } from "#/features/workspaces/cache";
import type { WorkspacePage } from "#/features/workspaces/contracts";
import { getWorkspacePageFn, listWorkspacesFn } from "#/features/workspaces/server/functions";

export function workspacesQueryOptions() {
	return queryOptions({
		queryKey: workspacesQueryKey,
		queryFn: () => listWorkspacesFn(),
	});
}

export function workspacePageQueryOptions(workspaceId: string) {
	const queryKey = workspacePageQueryKey(workspaceId);

	return queryOptions({
		queryKey,
		queryFn: async ({ client }) => {
			const incoming = await getWorkspacePageFn({ data: { workspaceId } });
			const current = client.getQueryData<WorkspacePage>(queryKey);

			return current && incoming && current.revision > incoming.revision ? current : incoming;
		},
		staleTime: 10_000,
	});
}
