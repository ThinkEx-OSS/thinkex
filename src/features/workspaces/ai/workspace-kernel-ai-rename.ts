import {
	getWorkspaceKernelAiPageContext,
	resolveWorkspaceKernelAiExistingItemPath,
} from "#/features/workspaces/ai/workspace-kernel-ai-common";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	getParentWorkspacePath,
	joinWorkspaceItemPath,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import { WorkspaceKernelNameConflictError } from "#/features/workspaces/kernel/workspace-kernel-store";

export interface RenameWorkspaceKernelAiItemInput {
	name: string;
	path: string;
	userId: string;
	workspaceId: string;
}

export interface RenameWorkspaceKernelAiFailure {
	code: "cannot_rename_root" | "path_already_exists" | "path_not_absolute" | "path_not_found";
	path: string;
}

export interface RenameWorkspaceKernelAiRenamedItem {
	path: string;
	previousPath: string;
	type: WorkspaceItemSummary["type"];
}

export interface RenameWorkspaceKernelAiItemResult {
	failed: RenameWorkspaceKernelAiFailure[];
	item?: RenameWorkspaceKernelAiRenamedItem;
}

export async function renameWorkspaceKernelAiItem(
	input: RenameWorkspaceKernelAiItemInput,
): Promise<RenameWorkspaceKernelAiItemResult> {
	const context = await getWorkspaceKernelAiPageContext({
		access: "mutate",
		userId: input.userId,
		workspaceId: input.workspaceId,
	});
	const resolution = resolveWorkspaceKernelAiExistingItemPath({
		path: input.path,
		rootFailureCode: "cannot_rename_root",
		tree: context.tree,
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
		const command = await context.kernel.renameItem({
			itemId: resolution.item.id,
			name: input.name,
			onNameConflict: "error",
			actorUserId: input.userId,
			clientMutationId: null,
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
