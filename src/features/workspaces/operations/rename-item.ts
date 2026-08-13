import {
	authorizeWorkspaceOperation,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import {
	renameWorkspaceItem,
	resolveWorkspacePaths,
} from "#/features/workspaces/persistence/workspace-items";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import {
	getParentWorkspacePath,
	joinWorkspaceItemPath,
} from "#/features/workspaces/model/workspace-paths";

export interface RenameWorkspaceItemOperationInput {
	name: string;
	path: string;
}

import { renameWorkspaceItemFailureCodes } from "#/features/workspaces/operations/workspace-operation-failure-codes";

export interface RenameWorkspaceItemFailure {
	code: (typeof renameWorkspaceItemFailureCodes)[number];
	path: string;
}

export interface RenamedWorkspaceItem {
	path: string;
	previousPath: string;
	type: WorkspaceItem["type"];
}

export interface RenameWorkspaceItemOperationResult {
	failed: RenameWorkspaceItemFailure[];
	item?: RenamedWorkspaceItem;
}

export async function renameWorkspaceItemOperation(
	accessContext: WorkspaceAccessContext,
	input: RenameWorkspaceItemOperationInput,
): Promise<RenameWorkspaceItemOperationResult> {
	await authorizeWorkspaceOperation({
		access: "mutate",
		context: accessContext,
	});
	const [pathResolution] = await resolveWorkspacePaths({
		paths: [input.path],
		workspaceId: accessContext.workspaceId,
	});
	if (!pathResolution) {
		throw new Error("Workspace persistence did not resolve the requested rename path.");
	}
	const resolution = resolveWorkspaceExistingItemPath({
		resolution: pathResolution,
		rootFailureCode: "cannot_rename_root",
	});

	if (resolution.status === "failed") {
		return {
			failed: [
				{
					code: resolution.failure.code,
					path: resolution.failure.path,
				},
			],
		};
	}

	const { env } = await import("cloudflare:workers");
	const outcome = await renameWorkspaceItem(env, {
		itemId: resolution.item.id,
		name: input.name,
		onNameConflict: "error",
		actorUserId: accessContext.actor.userId,
		workspaceId: accessContext.workspaceId,
	});

	if (outcome.status === "conflict") {
		return {
			failed: [
				{
					code: "path_already_exists",
					path: resolution.path,
				},
			],
		};
	}

	return {
		failed: [],
		item: {
			path: joinWorkspaceItemPath(
				getParentWorkspacePath(resolution.path),
				outcome.command.result.name,
			),
			previousPath: resolution.path,
			type: outcome.command.result.type,
		},
	};
}
