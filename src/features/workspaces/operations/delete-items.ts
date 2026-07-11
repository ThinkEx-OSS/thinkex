import {
	getWorkspaceOperationContext,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";

export interface DeleteWorkspaceItemsOperationInput {
	paths: string[];
}

export const deleteWorkspaceItemsFailureCodes = [
	"cannot_delete_root",
	"path_not_absolute",
	"path_not_found",
] as const;

export interface DeleteWorkspaceItemsFailure {
	code: (typeof deleteWorkspaceItemsFailureCodes)[number];
	index: number;
	path: string;
}

export interface DeletedWorkspaceItem {
	path: string;
	type: WorkspaceItemSummary["type"];
}

export interface DeleteWorkspaceItemsOperationResult {
	items: DeletedWorkspaceItem[];
	failed: DeleteWorkspaceItemsFailure[];
}

export async function deleteWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: DeleteWorkspaceItemsOperationInput,
): Promise<DeleteWorkspaceItemsOperationResult> {
	const workspaceContext = await getWorkspaceOperationContext({
		access: "mutate",
		context: accessContext,
	});
	const failed: DeleteWorkspaceItemsFailure[] = [];
	const resolvedItems: Array<{
		item: WorkspaceItemSummary;
		path: string;
	}> = [];

	for (const [index, path] of input.paths.entries()) {
		const resolution = resolveWorkspaceExistingItemPath({
			path,
			rootFailureCode: "cannot_delete_root",
			tree: workspaceContext.tree,
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

	const command = await workspaceContext.kernel.deleteItems({
		itemIds: resolvedItems.map((resolved) => resolved.item.id),
		actorUserId: accessContext.actor.userId,
		clientMutationId: accessContext.operationId,
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
