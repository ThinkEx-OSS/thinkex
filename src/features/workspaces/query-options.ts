import { queryOptions, replaceEqualDeep } from "@tanstack/react-query";

import type { WorkspacePage } from "#/features/workspaces/contracts";
import { workspacePageQueryKey, workspacesQueryKey } from "#/features/workspaces/cache";
import { getWorkspacePageFn, listWorkspacesFn } from "#/features/workspaces/server/functions";
import {
	clearVersionSkewReload,
	parseWorkspacePagePayload,
	reloadOnceForVersionSkew,
} from "#/features/workspaces/workspace-page-payload";

export function workspacesQueryOptions() {
	return queryOptions({
		queryKey: workspacesQueryKey,
		queryFn: () => listWorkspacesFn(),
	});
}

export function workspacePageQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: workspacePageQueryKey(workspaceId),
		queryFn: async () => {
			const payload = await getWorkspacePageFn({ data: { workspaceId } });
			const page = parseWorkspacePagePayload(payload);
			if (page) {
				clearVersionSkewReload();
				return page;
			}
			if (reloadOnceForVersionSkew()) {
				// The tab is reloading to the current bundle. Hold the loading state
				// so no stale render runs against the mismatched payload first.
				return new Promise<WorkspacePage>(() => {});
			}
			throw new Error("Workspace page payload did not match the expected schema.");
		},
		structuralSharing: (current, incoming) => {
			// TanStack exposes this commit-time boundary as unknown even though the
			// query function above owns the result type.
			const currentPage = current as WorkspacePage | undefined;
			const incomingPage = incoming as WorkspacePage;
			return currentPage && incomingPage && currentPage.revision > incomingPage.revision
				? currentPage
				: replaceEqualDeep(currentPage, incomingPage);
		},
		staleTime: 10_000,
	});
}
