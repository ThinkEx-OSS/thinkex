import type {
	WorkspaceItemFacts,
	WorkspaceItemSummary,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";
import {
	joinWorkspacePathSegment,
	resolveWorkspaceKernelCwd,
	WorkspaceKernelPathError,
	type WorkspaceKernelTree,
	type WorkspaceKernelPathErrorCode,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import {
	resolveWorkspaceFileTypeFromItem,
	type WorkspaceFileAssetKind,
} from "#/features/workspaces/model/workspace-file";

export interface ListWorkspaceKernelItemsResult {
	path: string;
	more: boolean;
	nextCursor?: string;
	items: ListWorkspaceKernelItem[];
	failed: ListWorkspaceKernelItemsFailure[];
}

export interface ListWorkspaceKernelItem {
	modifiedAt: string;
	pageCount?: number;
	path: string;
	relationshipCount: number;
	type: WorkspaceItemType | WorkspaceFileAssetKind;
}

export interface ListWorkspaceKernelItemsFailure {
	code: WorkspaceKernelPathErrorCode | "invalid_cursor";
	path: string;
}

interface WorkspaceKernelListedItems {
	items: ListWorkspaceKernelItem[];
	more: boolean;
	nextCursor?: string;
}

interface WorkspaceKernelListRow {
	item: WorkspaceItemSummary;
	path: string;
}

class WorkspaceListCursorError extends Error {
	constructor(readonly path: string) {
		super("Invalid workspace list cursor.");
		this.name = "WorkspaceListCursorError";
	}
}

export function listWorkspaceKernelTreeItems(input: {
	tree: WorkspaceKernelTree;
	itemFactsById: ReadonlyMap<string, WorkspaceItemFacts>;
	cursor?: string;
	path?: string;
	recursive?: boolean;
	limit?: number;
}): ListWorkspaceKernelItemsResult {
	try {
		const cwd = resolveWorkspaceKernelCwd(input.path ?? "/", input.tree);
		const boundedLimit = clampWorkspaceListLimit(input.limit);
		const listing = collectWorkspaceKernelListItems({
			cursor: input.cursor,
			parentId: cwd.parentId,
			basePath: cwd.path,
			recursive: input.recursive ?? false,
			limit: boundedLimit,
			childrenByParentId: input.tree.childrenByParentId,
			itemFactsById: input.itemFactsById,
		});

		return {
			path: cwd.path,
			more: listing.more,
			...(listing.nextCursor ? { nextCursor: listing.nextCursor } : {}),
			items: listing.items,
			failed: [],
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError || error instanceof WorkspaceListCursorError) {
			const path =
				error instanceof WorkspaceListCursorError ? error.path : input.path?.trim() || "/";

			return {
				path,
				more: false,
				items: [],
				failed: [
					{
						code: error instanceof WorkspaceListCursorError ? "invalid_cursor" : error.code,
						path,
					},
				],
			};
		}

		throw error;
	}
}

function collectWorkspaceKernelListItems({
	cursor,
	parentId,
	basePath,
	recursive,
	limit,
	childrenByParentId,
	itemFactsById,
}: {
	cursor?: string;
	parentId: string | null;
	basePath: string;
	recursive: boolean;
	limit: number;
	childrenByParentId: Map<string | null, WorkspaceItemSummary[]>;
	itemFactsById: ReadonlyMap<string, WorkspaceItemFacts>;
}): WorkspaceKernelListedItems {
	const rows: WorkspaceKernelListRow[] = [];
	const visitedIds = new Set<string>();

	const visit = (currentParentId: string | null, relativeParentPath: string) => {
		for (const child of childrenByParentId.get(currentParentId) ?? []) {
			if (visitedIds.has(child.id)) {
				continue;
			}

			visitedIds.add(child.id);

			const relativePath = joinWorkspacePathSegment(relativeParentPath, child.name);
			rows.push({
				item: child,
				path: toAbsoluteWorkspaceListPath(basePath, relativePath),
			});

			if (recursive) {
				visit(child.id, relativePath);
			}
		}
	};

	visit(parentId, "");
	const cursorIndex = cursor ? rows.findIndex((row) => row.item.id === cursor) : -1;

	if (cursor && cursorIndex === -1) {
		throw new WorkspaceListCursorError(basePath);
	}

	const startIndex = cursorIndex + 1;
	const pageRows = rows.slice(startIndex, startIndex + limit);
	const more = startIndex + pageRows.length < rows.length;
	const lastItemId = pageRows.at(-1)?.item.id;

	return {
		items: pageRows.map((row) =>
			formatWorkspaceKernelListItem({
				facts: itemFactsById.get(row.item.id),
				item: row.item,
				path: row.path,
			}),
		),
		more,
		...(more && lastItemId ? { nextCursor: lastItemId } : {}),
	};
}

function formatWorkspaceKernelListItem(input: {
	facts?: WorkspaceItemFacts;
	item: WorkspaceItemSummary;
	path: string;
}): ListWorkspaceKernelItem {
	return {
		modifiedAt: input.item.updatedAt,
		...(input.facts?.pageCount ? { pageCount: input.facts.pageCount } : {}),
		path: input.path,
		relationshipCount: input.facts?.relationshipCount ?? 0,
		type: resolveWorkspaceFileTypeFromItem(input.item)?.assetKind ?? input.item.type,
	};
}

function toAbsoluteWorkspaceListPath(basePath: string, relativePath: string) {
	if (basePath === "/") {
		return `/${relativePath}`;
	}

	return `${basePath}/${relativePath}`;
}

function clampWorkspaceListLimit(limit: number | undefined) {
	return Math.max(1, Math.min(limit ?? 100, 200));
}
