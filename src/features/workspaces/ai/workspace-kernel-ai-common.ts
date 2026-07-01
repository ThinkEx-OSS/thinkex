import { createDbContext } from "#/db/server";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	getWorkspaceKernel,
	type WorkspaceKernelClient,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import {
	buildWorkspaceKernelItemPathIndex,
	buildWorkspaceKernelTree,
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
	type WorkspaceKernelTree,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import {
	getWorkspaceItemLinkItemIds,
	type WorkspaceItemLink,
} from "#/features/workspaces/model/workspace-item-links";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";

export type WorkspaceKernelAiAccessMode = "read" | "mutate";

export interface WorkspaceKernelAiPageContext {
	kernel: WorkspaceKernelClient;
	pageItems: WorkspaceItemSummary[];
	tree: WorkspaceKernelTree;
}

export type WorkspaceKernelAiPathResolution =
	| {
			code: "path_not_absolute";
			path: string;
			status: "invalid_path";
	  }
	| {
			path: string;
			status: "not_found";
	  }
	| {
			path: string;
			status: "root";
	  }
	| {
			item: WorkspaceItemSummary;
			path: string;
			status: "item";
	  };

export type WorkspaceKernelAiExistingItemResolution<TRootCode extends string> =
	| {
			failure: {
				code: "path_not_absolute" | "path_not_found" | TRootCode;
				path: string;
			};
			status: "failed";
	  }
	| {
			item: WorkspaceItemSummary;
			path: string;
			status: "item";
	  };

export interface WorkspaceKernelAiCreatedLinkTarget {
	id: string;
	type: WorkspaceItemSummary["type"];
}

export type WorkspaceKernelAiLinkResolutionFailureCode =
	| "link_path_is_root"
	| "link_path_not_absolute"
	| "link_path_not_found";

export type WorkspaceKernelAiLinkResolution =
	| {
			linkItemIds: string[];
			status: "ready";
	  }
	| {
			code: WorkspaceKernelAiLinkResolutionFailureCode;
			index: number;
			path: string;
			status: "failed";
	  };

export async function getWorkspaceKernelAiPageContext(input: {
	access: WorkspaceKernelAiAccessMode;
	userId: string;
	workspaceId: string;
}): Promise<WorkspaceKernelAiPageContext> {
	const dbContext = await createDbContext();

	try {
		if (input.access === "read") {
			await assertCanReadWorkspace(dbContext.db, input);
		} else {
			await assertCanMutateWorkspace(dbContext.db, input);
		}

		const kernel = await getWorkspaceKernel(input.workspaceId);
		const page = await kernel.getPage();

		return {
			kernel,
			pageItems: page.items,
			tree: buildWorkspaceKernelTree(page.items),
		};
	} finally {
		await dbContext.dispose();
	}
}

export function resolveWorkspaceKernelAiPath(input: {
	path: string;
	tree: WorkspaceKernelTree;
}): WorkspaceKernelAiPathResolution {
	try {
		const normalizedPath = normalizeWorkspacePath(input.path);

		if (normalizedPath === "/") {
			return {
				path: normalizedPath,
				status: "root",
			};
		}

		const item = resolveWorkspaceKernelItemPath(normalizedPath, input.tree);

		if (!item) {
			return {
				path: normalizedPath,
				status: "not_found",
			};
		}

		return {
			item,
			path: normalizedPath,
			status: "item",
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
			return {
				code: error.code,
				path: input.path,
				status: "invalid_path",
			};
		}

		throw error;
	}
}

export function resolveWorkspaceKernelAiExistingItemPath<TRootCode extends string>(input: {
	path: string;
	rootFailureCode: TRootCode;
	tree: WorkspaceKernelTree;
}): WorkspaceKernelAiExistingItemResolution<TRootCode> {
	const resolution = resolveWorkspaceKernelAiPath(input);

	if (resolution.status === "invalid_path") {
		return {
			failure: {
				code: resolution.code,
				path: resolution.path,
			},
			status: "failed",
		};
	}

	if (resolution.status === "root") {
		return {
			failure: {
				code: input.rootFailureCode,
				path: resolution.path,
			},
			status: "failed",
		};
	}

	if (resolution.status === "not_found") {
		return {
			failure: {
				code: "path_not_found",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	return resolution;
}

export function resolveWorkspaceKernelAiLinkPaths(input: {
	createdItemsByPath?: ReadonlyMap<string, WorkspaceKernelAiCreatedLinkTarget>;
	paths: readonly string[];
	tree: WorkspaceKernelTree;
}): WorkspaceKernelAiLinkResolution {
	const linkItemIds: string[] = [];

	for (const [index, path] of input.paths.entries()) {
		const resolution = resolveWorkspaceKernelAiLinkPath({
			createdItemsByPath: input.createdItemsByPath,
			path,
			tree: input.tree,
		});

		if (resolution.status === "failed") {
			return {
				...resolution,
				index,
			};
		}

		linkItemIds.push(resolution.itemId);
	}

	return {
		linkItemIds: uniqueWorkspaceKernelAiLinkItemIds(linkItemIds),
		status: "ready",
	};
}

export function getWorkspaceKernelAiItemLinks(input: {
	item: WorkspaceItemSummary;
	pageItems: WorkspaceItemSummary[];
}): WorkspaceItemLink[] {
	const pathsByItemId = buildWorkspaceKernelItemPathIndex(input.pageItems);
	const itemsById = new Map(input.pageItems.map((item) => [item.id, item]));
	const links: WorkspaceItemLink[] = [];

	for (const itemId of getWorkspaceItemLinkItemIds(input.item.metadataJson)) {
		const item = itemsById.get(itemId);
		const path = pathsByItemId.get(itemId);

		if (!item || !path) {
			continue;
		}

		links.push({
			path,
			type: item.type,
		});
	}

	return links;
}

function resolveWorkspaceKernelAiLinkPath(input: {
	createdItemsByPath?: ReadonlyMap<string, WorkspaceKernelAiCreatedLinkTarget>;
	path: string;
	tree: WorkspaceKernelTree;
}):
	| {
			itemId: string;
			status: "ready";
	  }
	| {
			code: WorkspaceKernelAiLinkResolutionFailureCode;
			path: string;
			status: "failed";
	  } {
	let normalizedPath: string;

	try {
		normalizedPath = normalizeWorkspacePath(input.path);
	} catch (error) {
		if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
			return {
				code: "link_path_not_absolute",
				path: input.path,
				status: "failed",
			};
		}

		throw error;
	}

	if (normalizedPath === "/") {
		return {
			code: "link_path_is_root",
			path: normalizedPath,
			status: "failed",
		};
	}

	const createdItem = input.createdItemsByPath?.get(normalizedPath);

	if (createdItem) {
		return {
			itemId: createdItem.id,
			status: "ready",
		};
	}

	const item = resolveWorkspaceKernelItemPath(normalizedPath, input.tree);

	if (!item) {
		return {
			code: "link_path_not_found",
			path: normalizedPath,
			status: "failed",
		};
	}

	return {
		itemId: item.id,
		status: "ready",
	};
}

function uniqueWorkspaceKernelAiLinkItemIds(itemIds: readonly string[]) {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const itemId of itemIds) {
		if (seen.has(itemId)) {
			continue;
		}

		seen.add(itemId);
		result.push(itemId);
	}

	return result;
}
