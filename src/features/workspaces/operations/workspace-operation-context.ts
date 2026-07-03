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
import {
	assertWorkspaceAccessScope,
	type WorkspaceAccessContext,
} from "#/features/workspaces/operations/workspace-access-context";

export type WorkspaceOperationAccessMode = "read" | "mutate";

export interface WorkspaceOperationContext {
	kernel: WorkspaceKernelClient;
	pageItems: WorkspaceItemSummary[];
	tree: WorkspaceKernelTree;
}

export type WorkspaceOperationPathResolution =
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

export type WorkspaceExistingItemResolution<TRootCode extends string> =
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

export async function getWorkspaceOperationContext(input: {
	access: WorkspaceOperationAccessMode;
	context: WorkspaceAccessContext;
}): Promise<WorkspaceOperationContext> {
	const dbContext = await createDbContext();
	const workspaceUser = {
		userId: input.context.actor.userId,
		workspaceId: input.context.workspaceId,
	};

	try {
		if (input.access === "read") {
			assertWorkspaceAccessScope(input.context, "workspace:read");
			await assertCanReadWorkspace(dbContext.db, workspaceUser);
		} else {
			assertWorkspaceAccessScope(input.context, "workspace:write");
			await assertCanMutateWorkspace(dbContext.db, workspaceUser);
		}

		const kernel = await getWorkspaceKernel(input.context.workspaceId);
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

export function resolveWorkspaceOperationPath(input: {
	path: string;
	tree: WorkspaceKernelTree;
}): WorkspaceOperationPathResolution {
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

export function resolveWorkspaceExistingItemPath<TRootCode extends string>(input: {
	path: string;
	rootFailureCode: TRootCode;
	tree: WorkspaceKernelTree;
}): WorkspaceExistingItemResolution<TRootCode> {
	const resolution = resolveWorkspaceOperationPath(input);

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
