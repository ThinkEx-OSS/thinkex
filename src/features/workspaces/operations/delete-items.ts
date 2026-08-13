import {
	authorizeWorkspaceOperation,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import {
	deleteWorkspaceItems,
	resolveWorkspacePaths,
} from "#/features/workspaces/persistence/workspace-items";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { WorkspaceItem } from "#/features/workspaces/contracts";

export interface DeleteWorkspaceItemsOperationInput {
	paths: string[];
}

import { deleteWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/workspace-operation-failure-codes";

export interface DeleteWorkspaceItemsFailure {
	code: (typeof deleteWorkspaceItemsFailureCodes)[number];
	index: number;
	path: string;
}

export interface DeletedWorkspaceItem {
	path: string;
	type: WorkspaceItem["type"];
}

export interface DeleteWorkspaceItemsOperationResult {
	items: DeletedWorkspaceItem[];
	failed: DeleteWorkspaceItemsFailure[];
}

export async function deleteWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: DeleteWorkspaceItemsOperationInput,
): Promise<DeleteWorkspaceItemsOperationResult> {
	await authorizeWorkspaceOperation({
		access: "mutate",
		context: accessContext,
	});
	const failed: DeleteWorkspaceItemsFailure[] = [];
	const resolvedItems: Array<{
		item: WorkspaceItem;
		path: string;
	}> = [];
	const resolutions = await resolveWorkspacePaths({
		paths: input.paths,
		workspaceId: accessContext.workspaceId,
	});

	for (const [index, pathResolution] of resolutions.entries()) {
		const resolution = resolveWorkspaceExistingItemPath({
			resolution: pathResolution,
			rootFailureCode: "cannot_delete_root",
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

	const { env } = await import("cloudflare:workers");
	const command = await deleteWorkspaceItems(env, {
		itemIds: resolvedItems.map((resolved) => resolved.item.id),
		actorUserId: accessContext.actor.userId,
		workspaceId: accessContext.workspaceId,
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
