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
	total: number;
	nextOffset?: number;
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
	code: WorkspaceKernelPathErrorCode;
	path: string;
}

interface WorkspaceKernelListSelection {
	failed: ListWorkspaceKernelItemsFailure[];
	path: string;
	rows: WorkspaceKernelListRow[];
	total: number;
	nextOffset?: number;
}

interface WorkspaceKernelListRow {
	item: WorkspaceItemSummary;
	path: string;
}

export function listWorkspaceKernelTreeItems(input: {
	getItemFacts: (items: WorkspaceItemSummary[]) => WorkspaceItemFacts[];
	tree: WorkspaceKernelTree;
	offset?: number;
	path?: string;
	recursive?: boolean;
	limit?: number;
}): ListWorkspaceKernelItemsResult {
	const selection = selectWorkspaceKernelTreeItems(input);
	return formatWorkspaceKernelListSelection(
		selection,
		input.getItemFacts(selection.rows.map((row) => row.item)),
	);
}

function selectWorkspaceKernelTreeItems(input: {
	tree: WorkspaceKernelTree;
	offset?: number;
	path?: string;
	recursive?: boolean;
	limit?: number;
}): WorkspaceKernelListSelection {
	try {
		const cwd = resolveWorkspaceKernelCwd(input.path ?? "/", input.tree);
		const boundedLimit = clampWorkspaceListLimit(input.limit);
		const listing = collectWorkspaceKernelListRows({
			offset: input.offset ?? 0,
			parentId: cwd.parentId,
			basePath: cwd.path,
			recursive: input.recursive ?? false,
			limit: boundedLimit,
			childrenByParentId: input.tree.childrenByParentId,
		});

		return {
			path: cwd.path,
			total: listing.total,
			...(listing.nextOffset !== undefined ? { nextOffset: listing.nextOffset } : {}),
			rows: listing.rows,
			failed: [],
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError) {
			const path = input.path?.trim() || "/";
			return {
				path,
				total: 0,
				rows: [],
				failed: [
					{
						code: error.code,
						path,
					},
				],
			};
		}

		throw error;
	}
}

function formatWorkspaceKernelListSelection(
	selection: WorkspaceKernelListSelection,
	itemFacts: WorkspaceItemFacts[],
): ListWorkspaceKernelItemsResult {
	const itemFactsById = new Map(itemFacts.map((facts) => [facts.itemId, facts]));
	return {
		failed: selection.failed,
		items: selection.rows.map((row) =>
			formatWorkspaceKernelListItem({
				facts: itemFactsById.get(row.item.id),
				item: row.item,
				path: row.path,
			}),
		),
		...(selection.nextOffset !== undefined ? { nextOffset: selection.nextOffset } : {}),
		path: selection.path,
		total: selection.total,
	};
}

function collectWorkspaceKernelListRows({
	offset,
	parentId,
	basePath,
	recursive,
	limit,
	childrenByParentId,
}: {
	offset: number;
	parentId: string | null;
	basePath: string;
	recursive: boolean;
	limit: number;
	childrenByParentId: Map<string | null, WorkspaceItemSummary[]>;
}): Pick<WorkspaceKernelListSelection, "nextOffset" | "rows" | "total"> {
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
	const pageRows = rows.slice(offset, offset + limit);
	const nextOffset = offset + pageRows.length;

	return {
		rows: pageRows,
		total: rows.length,
		...(nextOffset < rows.length ? { nextOffset } : {}),
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
