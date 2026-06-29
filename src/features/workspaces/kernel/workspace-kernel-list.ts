import type { WorkspaceItemSummary, WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	buildWorkspaceKernelTree,
	joinWorkspacePathSegment,
	resolveWorkspaceKernelCwd,
	WorkspaceKernelPathError,
	type WorkspaceKernelPathErrorCode,
} from "#/features/workspaces/kernel/workspace-kernel-paths";

export interface ListWorkspaceKernelItemsResult {
	path: string;
	more: boolean;
	items: ListWorkspaceKernelItem[];
	failed: ListWorkspaceKernelItemsFailure[];
}

export interface ListWorkspaceKernelItem {
	path: string;
	type: WorkspaceItemType;
}

export interface ListWorkspaceKernelItemsFailure {
	code: WorkspaceKernelPathErrorCode;
	path: string;
}

interface WorkspaceKernelListedItems {
	items: ListWorkspaceKernelItem[];
	truncated: boolean;
}

export function listWorkspaceKernelPageItems(input: {
	items: WorkspaceItemSummary[];
	path?: string;
	recursive?: boolean;
	limit?: number;
}): ListWorkspaceKernelItemsResult {
	try {
		const tree = buildWorkspaceKernelTree(input.items);
		const cwd = resolveWorkspaceKernelCwd(input.path ?? "/", tree);
		const boundedLimit = clampWorkspaceListLimit(input.limit);
		const listing = collectWorkspaceKernelListItems({
			parentId: cwd.parentId,
			basePath: cwd.path,
			recursive: input.recursive ?? false,
			limit: boundedLimit,
			childrenByParentId: tree.childrenByParentId,
		});

		return {
			path: cwd.path,
			more: listing.truncated,
			items: listing.items,
			failed: [],
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError) {
			const path = input.path?.trim() || "/";

			return {
				path,
				more: false,
				items: [],
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

function collectWorkspaceKernelListItems({
	parentId,
	basePath,
	recursive,
	limit,
	childrenByParentId,
}: {
	parentId: string | null;
	basePath: string;
	recursive: boolean;
	limit: number;
	childrenByParentId: Map<string | null, WorkspaceItemSummary[]>;
}): WorkspaceKernelListedItems {
	const items: ListWorkspaceKernelItem[] = [];
	const visitedIds = new Set<string>();
	let truncated = false;

	const visit = (currentParentId: string | null, relativeParentPath: string): boolean => {
		for (const child of childrenByParentId.get(currentParentId) ?? []) {
			if (visitedIds.has(child.id)) {
				continue;
			}

			visitedIds.add(child.id);

			const relativePath = joinWorkspacePathSegment(relativeParentPath, child.name);

			if (items.length >= limit) {
				truncated = true;
				return false;
			}

			items.push(
				formatWorkspaceKernelListItem({
					item: child,
					path: toAbsoluteWorkspaceListPath(basePath, relativePath),
				}),
			);

			if (recursive && !visit(child.id, relativePath)) {
				return false;
			}
		}

		return true;
	};

	visit(parentId, "");

	return {
		items,
		truncated,
	};
}

function formatWorkspaceKernelListItem(input: {
	item: WorkspaceItemSummary;
	path: string;
}): ListWorkspaceKernelItem {
	return {
		path: input.path,
		type: input.item.type,
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
