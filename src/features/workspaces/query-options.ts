import { queryOptions } from "@tanstack/react-query";

import {
	workspaceItemContentQueryKey,
	workspacePageQueryKey,
	workspacesQueryKey,
} from "#/features/workspaces/cache";
import {
	getWorkspacePageFn,
	listWorkspacesFn,
	readWorkspaceItemContentFn,
} from "#/features/workspaces/server/functions";

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

export function workspaceItemContentQueryOptions(workspaceId: string, itemId: string) {
	return queryOptions({
		queryKey: workspaceItemContentQueryKey(workspaceId, itemId),
		queryFn: () => readWorkspaceItemContentFn({ data: { workspaceId, itemId } }),
	});
}
