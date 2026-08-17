import type { z } from "zod";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { authorizeWorkspaceOperation } from "#/features/workspaces/operations/workspace-operation-context";
import type { workspaceSearchItemsOutputSchema } from "#/features/workspaces/operations/workspace-tool-schemas";
import { searchWorkspaceContent } from "#/features/workspaces/persistence/workspace-search";
import { hasNameSearchQuery, rankNameSearch } from "#/lib/name-search";

export interface SearchWorkspaceItemsOperationInput {
	patterns: string[];
}

type WorkspaceSearchItemsOutput = z.output<typeof workspaceSearchItemsOutputSchema>;

/** Name matches listed above the content hits. */
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
		patterns: input.patterns,
		workspaceId: accessContext.workspaceId,
	});

	const itemsById = new Map(result.items.map((item) => [item.id, item]));
	const contentItemIds = new Set(result.contentHits.map((hit) => hit.itemId));
	const nameHits = rankNamesAcrossPatterns(input.patterns, result.items)
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

/**
 * Patterns are alternatives, but `rankNameSearch` treats spaces as AND-tokens
 * (its own contract), so joining them would demand one name contain every word
 * of every phrasing. Rank each separately and merge, keeping each item at its
 * best position.
 *
 * Patterns with nothing searchable in them — punctuation, emoji, whitespace —
 * are skipped rather than ranked: `rankNameSearch` answers those with the
 * whole list, which would hand the model every item in the workspace as a hit.
 */
function rankNamesAcrossPatterns(patterns: string[], items: readonly WorkspaceItem[]) {
	const bestRankByItemId = new Map<string, { item: WorkspaceItem; rank: number }>();

	for (const pattern of patterns.filter(hasNameSearchQuery)) {
		rankNameSearch(pattern, items, (item) => [item.name]).forEach((item, rank) => {
			const current = bestRankByItemId.get(item.id);
			if (!current || rank < current.rank) {
				bestRankByItemId.set(item.id, { item, rank });
			}
		});
	}

	return Array.from(bestRankByItemId.values())
		.sort((left, right) => left.rank - right.rank)
		.map((entry) => entry.item);
}
