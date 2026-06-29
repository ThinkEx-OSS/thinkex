import {
	getWorkspaceKernelAiPageContext,
	resolveWorkspaceKernelAiExistingItemPath,
} from "#/features/workspaces/ai/workspace-kernel-ai-common";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";

export interface DeleteWorkspaceKernelAiItemsInput {
	paths: string[];
	userId: string;
	workspaceId: string;
}

export interface DeleteWorkspaceKernelAiFailure {
	code: "cannot_delete_root" | "path_not_absolute" | "path_not_found";
	index: number;
	path: string;
}

export interface DeleteWorkspaceKernelAiDeletedItem {
	path: string;
	type: WorkspaceItemSummary["type"];
}

export interface DeleteWorkspaceKernelAiItemsResult {
	items: DeleteWorkspaceKernelAiDeletedItem[];
	failed: DeleteWorkspaceKernelAiFailure[];
}

export async function deleteWorkspaceKernelAiItems(
	input: DeleteWorkspaceKernelAiItemsInput,
): Promise<DeleteWorkspaceKernelAiItemsResult> {
	const context = await getWorkspaceKernelAiPageContext({
		access: "mutate",
		userId: input.userId,
		workspaceId: input.workspaceId,
	});
	const failed: DeleteWorkspaceKernelAiFailure[] = [];
	const resolvedItems: Array<{
		item: WorkspaceItemSummary;
		path: string;
	}> = [];

	for (const [index, path] of input.paths.entries()) {
		const resolution = resolveWorkspaceKernelAiExistingItemPath({
			path,
			rootFailureCode: "cannot_delete_root",
			tree: context.tree,
		});

		if (resolution.status === "failed") {
			failed.push({
				code: resolution.failure.code,
				index,
				path: resolution.failure.path,
			});
			continue;
		}

		resolvedItems.push({
			item: resolution.item,
			path: resolution.path,
		});
	}

	if (resolvedItems.length === 0) {
		return {
			items: [],
			failed,
		};
	}

	const command = await context.kernel.deleteItems({
		itemIds: resolvedItems.map((resolved) => resolved.item.id),
		actorUserId: input.userId,
		clientMutationId: null,
	});
	const resolvedItemsById = new Map<string, (typeof resolvedItems)[number]>();

	for (const resolved of resolvedItems) {
		if (!resolvedItemsById.has(resolved.item.id)) {
			resolvedItemsById.set(resolved.item.id, resolved);
		}
	}

	const items = command.result.itemIds.map((itemId) => {
		const resolved = resolvedItemsById.get(itemId);

		if (!resolved) {
			throw new Error(`Deleted workspace item was not resolved: ${itemId}`);
		}

		return {
			path: resolved.path,
			type: resolved.item.type,
		};
	});

	return {
		items,
		failed,
	};
}
