import type { z } from "zod";

import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { authorizeWorkspaceOperation } from "#/features/workspaces/operations/workspace-operation-context";
import type { workspaceSearchItemsOutputSchema } from "#/features/workspaces/operations/workspace-tool-schemas";
import { searchWorkspaceContent } from "#/features/workspaces/persistence/workspace-search";
import { rankNameSearch } from "#/lib/name-search";

export interface SearchWorkspaceItemsOperationInput {
	path?: string;
	patterns: string[];
}

type WorkspaceSearchItemsOutput = z.output<typeof workspaceSearchItemsOutputSchema>;

/** Name matches shown above the content hits, before the content budget applies. */
const MAX_NAME_HITS = 5;

export async function searchWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: SearchWorkspaceItemsOperationInput,
): Promise<WorkspaceSearchItemsOutput> {
	await authorizeWorkspaceOperation({
		access: "read",
		context: accessContext,
	});

	const result = await searchWorkspaceContent({
		path: input.path,
		patterns: input.patterns,
		workspaceId: accessContext.workspaceId,
	});

	const itemsById = new Map(result.items.map((item) => [item.id, item]));
	const contentItemIds = new Set(result.contentHits.map((hit) => hit.itemId));
	const nameHits = rankNameSearch(input.patterns.join(" "), result.items, (item) => [item.name])
		.filter((item) => !contentItemIds.has(item.id))
		.slice(0, MAX_NAME_HITS)
		.flatMap((item) => {
			const path = result.pathsByItemId.get(item.id);
			return path ? [{ match: "name" as const, path, ref: item.refKey, type: item.type }] : [];
		});

	const contentHits = result.contentHits.flatMap((hit) => {
		const item = itemsById.get(hit.itemId);
		const path = result.pathsByItemId.get(hit.itemId);
		if (!item || !path) return [];

		return [
			{
				match: "content" as const,
				path,
				ref: hit.pageNumber ? `${item.refKey}/p${hit.pageNumber}` : item.refKey,
				snippet: hit.snippet,
				type: item.type,
				...(hit.pageNumber ? { page: hit.pageNumber } : {}),
			},
		];
	});

	const unsearchable = result.unsearchable.flatMap((file) => {
		const path = result.pathsByItemId.get(file.itemId);
		return path ? [{ path, reason: file.reason }] : [];
	});

	return {
		hits: [...nameHits, ...contentHits],
		matches: result.totalHits,
		...(unsearchable.length > 0 ? { unsearchable } : {}),
	};
}
