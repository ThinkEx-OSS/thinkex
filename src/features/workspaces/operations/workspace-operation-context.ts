import { createDbContext } from "#/db/server";
import type { WorkspacePathResolution } from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
} from "#/features/workspaces/server/permissions";
import {
	assertWorkspaceAccessScope,
	type WorkspaceAccessContext,
} from "#/features/workspaces/operations/workspace-access-context";

type WorkspaceOperationAccessMode = "read" | "mutate";

export async function authorizeWorkspaceOperation(input: {
	access: WorkspaceOperationAccessMode;
	context: WorkspaceAccessContext;
}): Promise<void> {
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
			item: Extract<WorkspacePathResolution, { status: "item" }>["item"];
			path: string;
			status: "item";
	  };

export function resolveWorkspaceExistingItemPath<TRootCode extends string>(input: {
	resolution: WorkspacePathResolution;
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
