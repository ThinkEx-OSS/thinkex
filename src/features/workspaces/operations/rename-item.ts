import {
	getAuthorizedWorkspaceKernel,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	getParentWorkspacePath,
	joinWorkspaceItemPath,
} from "#/features/workspaces/kernel/workspace-kernel-paths";

export interface RenameWorkspaceItemOperationInput {
	name: string;
	path: string;
}

export const renameWorkspaceItemFailureCodes = [
	"cannot_rename_root",
	"path_already_exists",
	"path_not_absolute",
	"path_not_found",
] as const;

export interface RenameWorkspaceItemFailure {
	code: (typeof renameWorkspaceItemFailureCodes)[number];
	path: string;
}

export interface RenamedWorkspaceItem {
	path: string;
	previousPath: string;
	type: WorkspaceItemSummary["type"];
}

export interface RenameWorkspaceItemOperationResult {
	failed: RenameWorkspaceItemFailure[];
	item?: RenamedWorkspaceItem;
}

export async function renameWorkspaceItemOperation(
	accessContext: WorkspaceAccessContext,
	input: RenameWorkspaceItemOperationInput,
): Promise<RenameWorkspaceItemOperationResult> {
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "mutate",
		context: accessContext,
	});
	const [pathResolution] = await kernel.resolvePaths({ paths: [input.path] });
	if (!pathResolution) {
		throw new Error("Workspace kernel did not resolve the requested rename path.");
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

	const outcome = await kernel.renameItem({
		itemId: resolution.item.id,
		name: input.name,
		onNameConflict: "error",
		actorUserId: accessContext.actor.userId,
		clientMutationId: accessContext.operationId,
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
