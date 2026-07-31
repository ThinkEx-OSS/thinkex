import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	buildWorkspaceKernelTree,
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import type {
	WorkspaceSearchFailure,
	WorkspaceSearchItemType,
} from "#/features/workspaces/search/workspace-search-contract";

const maximumVectorFilterBytes = 2_048;

export type WorkspaceSearchVectorFilter = VectorizeVectorMetadataFilter | null;

export type WorkspaceSearchLocalScope =
	| { kind: "workspace" }
	| { itemId: string; kind: "item" }
	| { folderIds: string[]; kind: "folder" };

export interface WorkspaceSearchScope {
	local: WorkspaceSearchLocalScope;
	vectorFilters: WorkspaceSearchVectorFilter[];
}

export function resolveWorkspaceSearchScope(input: {
	items: WorkspaceItemSummary[];
	path: string;
	types: WorkspaceSearchItemType[];
}):
	| { scope: WorkspaceSearchScope; status: "ready" }
	| { failure: WorkspaceSearchFailure; status: "failed" } {
	let path: string;
	try {
		path = normalizeWorkspacePath(input.path);
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
			return {
				failure: { code: error.code, path: input.path },
				status: "failed",
			};
		}
		throw error;
	}

	if (path === "/") {
		return {
			scope: {
				local: { kind: "workspace" },
				vectorFilters: createWorkspaceSearchVectorFilters({
					kind: "workspace",
					types: input.types,
				}),
			},
			status: "ready",
		};
	}

	const tree = buildWorkspaceKernelTree(input.items);
	const item = resolveWorkspaceKernelItemPath(path, tree);
	if (!item) {
		return {
			failure: { code: "path_not_found", path },
			status: "failed",
		};
	}
	if (item.type !== "folder") {
		const itemType = isWorkspaceSearchItemType(item.type) ? item.type : null;
		return {
			scope: {
				local: { itemId: item.id, kind: "item" },
				vectorFilters:
					itemType && input.types.includes(itemType)
						? createWorkspaceSearchVectorFilters({
								itemId: item.id,
								kind: "item",
							})
						: [],
			},
			status: "ready",
		};
	}

	const folderIds = listWorkspaceSearchFolderIds(item.id, tree.childrenByParentId);
	return {
		scope: {
			local: { folderIds, kind: "folder" },
			vectorFilters: createWorkspaceSearchVectorFilters({
				folderIds,
				kind: "folder",
				types: input.types,
			}),
		},
		status: "ready",
	};
}

export function createWorkspaceSearchVectorMetadata(input: {
	itemId: string;
	parentId: string | null;
	type: WorkspaceSearchItemType;
}): NonNullable<VectorizeVector["metadata"]> {
	return {
		itemId: input.itemId,
		...(input.parentId ? { parentId: input.parentId } : {}),
		type: input.type,
	};
}

function createWorkspaceSearchVectorFilters(
	input:
		| { kind: "workspace"; types: WorkspaceSearchItemType[] }
		| { itemId: string; kind: "item" }
		| { folderIds: string[]; kind: "folder"; types: WorkspaceSearchItemType[] },
): WorkspaceSearchVectorFilter[] {
	if (input.kind === "item") {
		return [{ itemId: input.itemId }];
	}
	const uniqueTypes = Array.from(new Set(input.types));
	const type = uniqueTypes.length === 1 ? uniqueTypes[0] : undefined;
	if (input.kind === "workspace") {
		return type ? [{ type }] : [null];
	}

	return batchFolderFilters(input.folderIds, (folderIds) => {
		const filter: VectorizeVectorMetadataFilter = { parentId: { $in: folderIds } };
		if (type) {
			filter.type = type;
		}
		return filter;
	});
}

function batchFolderFilters(
	folderIds: string[],
	createFilter: (folderIds: string[]) => VectorizeVectorMetadataFilter,
) {
	const filters: VectorizeVectorMetadataFilter[] = [];
	let batch: string[] = [];

	for (const folderId of folderIds) {
		const nextBatch = [...batch, folderId];
		if (getFilterByteLength(createFilter(nextBatch)) < maximumVectorFilterBytes) {
			batch = nextBatch;
			continue;
		}
		if (batch.length === 0) {
			throw new Error("Workspace folder identifier exceeds the Vectorize filter limit.");
		}
		filters.push(createFilter(batch));
		batch = [folderId];
	}

	if (batch.length > 0) {
		filters.push(createFilter(batch));
	}
	return filters;
}

function getFilterByteLength(filter: VectorizeVectorMetadataFilter) {
	return new TextEncoder().encode(JSON.stringify(filter)).byteLength;
}

function isWorkspaceSearchItemType(type: WorkspaceItemSummary["type"]) {
	return type === "document" || type === "file";
}

function listWorkspaceSearchFolderIds(
	folderId: string,
	childrenByParentId: Map<string | null, WorkspaceItemSummary[]>,
) {
	const folderIds: string[] = [];
	const pending = [folderId];
	const visited = new Set<string>();

	while (pending.length > 0) {
		const parentId = pending.pop();
		if (!parentId || visited.has(parentId)) {
			continue;
		}
		visited.add(parentId);
		folderIds.push(parentId);

		for (const item of childrenByParentId.get(parentId) ?? []) {
			if (item.type === "folder") {
				pending.push(item.id);
			}
		}
	}

	return folderIds;
}
