import { createDbContext } from "#/db/server";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	getWorkspaceKernel,
	type WorkspaceKernelClient,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import {
	buildWorkspaceKernelTree,
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
	type WorkspaceKernelTree,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
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
