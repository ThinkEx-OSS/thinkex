import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { getWorkspaceAiContextItemPath } from "#/features/workspaces/model/workspace-ai-context-reference";
import { workspacePageQueryOptions } from "#/features/workspaces/query-options";

/**
 * Absolute workspace path for one item, for surfaces that only hold the item.
 *
 * Reads the already-cached workspace page rather than asking the server, so a
 * component can name a path without waiting on a round trip. Returns null until
 * the page is in cache.
 */
export function useWorkspaceItemPath(workspaceId: string, item: WorkspaceItem | null) {
	const { data } = useQuery(workspacePageQueryOptions(workspaceId));
	const items = data?.items;

	return useMemo(() => {
		if (!item || !items) {
			return null;
		}

		return getWorkspaceAiContextItemPath(item, new Map(items.map((entry) => [entry.id, entry])));
	}, [item, items]);
}
