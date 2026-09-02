import type { WorkspaceItem, WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	joinWorkspacePathSegment,
	resolveWorkspaceCwd,
	WorkspacePathError,
	type WorkspaceTree,
	type WorkspacePathErrorCode,
} from "#/features/workspaces/model/workspace-paths";
import {
	getMetadataOwnerItemId,
	resolveWorkspaceFileTypeFromItem,
	type WorkspaceFileAssetKind,
} from "#/features/workspaces/model/workspace-file";

export interface ListWorkspaceItemsResult {
	path: string;
	total: number;
	nextOffset?: number;
	items: ListWorkspaceItem[];
	failed: ListWorkspaceItemsFailure[];
}

export interface ListWorkspaceItem {
	modifiedAt: string;
	path: string;
	type: WorkspaceItemType | WorkspaceFileAssetKind;
}

export interface ListWorkspaceItemsFailure {
	code: WorkspacePathErrorCode;
	path: string;
}

interface WorkspaceListSelection {
	failed: ListWorkspaceItemsFailure[];
	path: string;
	rows: WorkspaceListRow[];
	total: number;
	nextOffset?: number;
}

interface WorkspaceListRow {
	item: WorkspaceItem;
	path: string;
}

export function listWorkspaceTreeItems(input: {
	tree: WorkspaceTree;
	offset?: number;
	path?: string;
	recursive?: boolean;
	limit?: number;
}): ListWorkspaceItemsResult {
	return formatWorkspaceListSelection(selectWorkspaceTreeItems(input));
}

function selectWorkspaceTreeItems(input: {
	tree: WorkspaceTree;
	offset?: number;
	path?: string;
	recursive?: boolean;
	limit?: number;
}): WorkspaceListSelection {
	try {
		const cwd = resolveWorkspaceCwd(input.path ?? "/", input.tree);
		const boundedLimit = clampWorkspaceListLimit(input.limit);
		// Owner-bound images live inside a document or card set; listing them as
		// loose files would double-count content the model already sees inline.
		const visibleChildrenByParentId = new Map(
			Array.from(input.tree.childrenByParentId, ([parentId, children]) => [
				parentId,
				children.filter((item) => !getMetadataOwnerItemId(item.metadataJson)),
			]),
		);
		const listing = collectWorkspaceListRows({
			offset: input.offset ?? 0,
			parentId: cwd.parentId,
			basePath: cwd.path,
			recursive: input.recursive ?? false,
			limit: boundedLimit,
			childrenByParentId: visibleChildrenByParentId,
		});

		return {
			path: cwd.path,
			total: listing.total,
			...(listing.nextOffset !== undefined ? { nextOffset: listing.nextOffset } : {}),
			rows: listing.rows,
			failed: [],
		};
	} catch (error) {
		if (error instanceof WorkspacePathError) {
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

function formatWorkspaceListSelection(selection: WorkspaceListSelection): ListWorkspaceItemsResult {
	return {
		failed: selection.failed,
		items: selection.rows.map((row) =>
			formatWorkspaceListItem({
				item: row.item,
				path: row.path,
			}),
		),
		...(selection.nextOffset !== undefined ? { nextOffset: selection.nextOffset } : {}),
		path: selection.path,
		total: selection.total,
	};
}

function collectWorkspaceListRows({
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
	childrenByParentId: Map<string | null, WorkspaceItem[]>;
}): Pick<WorkspaceListSelection, "nextOffset" | "rows" | "total"> {
	const rows: WorkspaceListRow[] = [];
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

function formatWorkspaceListItem(input: { item: WorkspaceItem; path: string }): ListWorkspaceItem {
	return {
		modifiedAt: input.item.updatedAt,
		path: input.path,
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
