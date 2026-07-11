import {
	getWorkspaceOperationContext,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	getParentWorkspacePath,
	joinWorkspaceItemPath,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import { WorkspaceKernelNameConflictError } from "#/features/workspaces/kernel/workspace-kernel-store";

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
	const workspaceContext = await getWorkspaceOperationContext({
		access: "mutate",
		context: accessContext,
	});
	const resolution = resolveWorkspaceExistingItemPath({
		path: input.path,
		rootFailureCode: "cannot_rename_root",
		tree: workspaceContext.tree,
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

	try {
		const command = await workspaceContext.kernel.renameItem({
			itemId: resolution.item.id,
			name: input.name,
			onNameConflict: "error",
			actorUserId: accessContext.actor.userId,
			clientMutationId: accessContext.operationId,
		});

		return {
			failed: [],
			item: {
				path: joinWorkspaceItemPath(getParentWorkspacePath(resolution.path), command.result.name),
				previousPath: resolution.path,
				type: command.result.type,
			},
		};
	} catch (error) {
		if (error instanceof WorkspaceKernelNameConflictError) {
			return {
				failed: [
					{
						code: "path_already_exists",
						path: resolution.path,
					},
				],
			};
		}

		throw error;
	}
}
