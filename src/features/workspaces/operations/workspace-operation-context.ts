import { createDbContext } from "#/db/server";
import {
	getWorkspaceKernel,
	type WorkspaceKernelClient,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import type { WorkspaceKernelPathResolution } from "#/features/workspaces/kernel/workspace-kernel-types";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";
import {
	assertWorkspaceAccessScope,
	type WorkspaceAccessContext,
} from "#/features/workspaces/operations/workspace-access-context";

type WorkspaceOperationAccessMode = "read" | "mutate";

export async function getAuthorizedWorkspaceKernel(input: {
	access: WorkspaceOperationAccessMode;
	context: WorkspaceAccessContext;
}): Promise<WorkspaceKernelClient> {
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

		return await getWorkspaceKernel(input.context.workspaceId);
	} finally {
		await dbContext.dispose();
	}
}

export type WorkspaceExistingItemResolution<TRootCode extends string> =
	| {
			failure: {
				code: "path_not_absolute" | "path_not_found" | TRootCode;
				path: string;
			};
			status: "failed";
	  }
	| {
			item: Extract<WorkspaceKernelPathResolution, { status: "item" }>["item"];
			path: string;
			status: "item";
	  };

export function resolveWorkspaceExistingItemPath<TRootCode extends string>(input: {
	resolution: WorkspaceKernelPathResolution;
	rootFailureCode: TRootCode;
}): WorkspaceExistingItemResolution<TRootCode> {
	const { resolution } = input;

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
