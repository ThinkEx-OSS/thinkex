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
import type { WorkspaceKernelPathResolution } from "#/features/workspaces/kernel/workspace-kernel-types";

export interface MoveWorkspaceItemsOperationInput {
	destinationPath: string;
	paths: string[];
}

export const moveWorkspaceItemsFailureCodes = [
	"already_in_destination",
	"cannot_move_into_descendant",
	"cannot_move_root",
	"destination_path_not_absolute",
	"destination_path_not_folder",
	"destination_path_not_found",
	"path_already_exists",
	"path_not_absolute",
	"path_not_found",
] as const;

interface MoveWorkspaceDestinationFailure {
	code:
		| "destination_path_not_absolute"
		| "destination_path_not_folder"
		| "destination_path_not_found";
	path: string;
}

export interface MoveWorkspaceItemsFailure {
	code: (typeof moveWorkspaceItemsFailureCodes)[number];
	index?: number;
	path: string;
}

export interface MovedWorkspaceItem {
	path: string;
	previousPath: string;
	type: WorkspaceItemSummary["type"];
}

export interface MoveWorkspaceItemsOperationResult {
	failed: MoveWorkspaceItemsFailure[];
	items: MovedWorkspaceItem[];
}

export async function moveWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: MoveWorkspaceItemsOperationInput,
): Promise<MoveWorkspaceItemsOperationResult> {
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "mutate",
		context: accessContext,
	});
	const [destinationResolution, ...itemResolutions] = await kernel.resolvePaths({
		paths: [input.destinationPath, ...input.paths],
	});
	if (!destinationResolution) {
		throw new Error("Workspace kernel did not resolve the requested move destination.");
	}
	const destination = resolveMoveWorkspaceDestination({
		resolution: destinationResolution,
	});

	if (destination.status === "failed") {
		return {
			failed: [
				{
					code: destination.failure.code,
					path: destination.failure.path,
				},
			],
			items: [],
		};
	}

	const failed: MoveWorkspaceItemsFailure[] = [];
	const resolvedItems: Array<{
		index: number;
		item: WorkspaceItemSummary;
		path: string;
	}> = [];

	for (const [index, pathResolution] of itemResolutions.entries()) {
		const resolution = resolveWorkspaceExistingItemPath({
			resolution: pathResolution,
			rootFailureCode: "cannot_move_root",
		});

		if (resolution.status === "failed") {
			failed.push({
				code: resolution.failure.code,
				index,
				path: resolution.failure.path,
			});
			continue;
		}

		if (
			resolution.item.type === "folder" &&
			isWorkspacePathEqualOrDescendant(resolution.path, destination.path)
		) {
			failed.push({
				code: "cannot_move_into_descendant",
				index,
				path: resolution.path,
			});
			continue;
		}

		if (getParentWorkspacePath(resolution.path) === destination.path) {
			failed.push({
				code: "already_in_destination",
				index,
				path: resolution.path,
			});
			continue;
		}

		resolvedItems.push({
			index,
			item: resolution.item,
			path: resolution.path,
		});
	}

	if (resolvedItems.length === 0) {
		return {
			failed,
			items: [],
		};
	}

	const items: MovedWorkspaceItem[] = [];
	const pendingItems = [...resolvedItems];

	while (pendingItems.length > 0) {
		const outcome = await kernel.moveItems({
			items: pendingItems.map((resolved) => ({ itemId: resolved.item.id })),
			parentId: destination.parentId,
			onNameConflict: "error",
			actorUserId: accessContext.actor.userId,
			clientMutationId: accessContext.operationId,
		});

		if (outcome.status === "conflict") {
			const conflictIndex = pendingItems.findIndex(
				(resolved) => resolved.item.id === outcome.conflict.itemId,
			);

			if (conflictIndex < 0) {
				throw new Error("Workspace move conflict did not identify a pending item.");
			}

			const [conflictedItem] = pendingItems.splice(conflictIndex, 1);
			failed.push({
				code: "path_already_exists",
				index: conflictedItem.index,
				path: conflictedItem.path,
			});
			continue;
		}

		const pendingItemsById = new Map(
			pendingItems.map((pendingItem) => [pendingItem.item.id, pendingItem] as const),
		);
		items.push(
			...outcome.command.result.map((item) => {
				const resolved = pendingItemsById.get(item.id);

				if (!resolved) {
					throw new Error(`Moved workspace item was not resolved: ${item.id}`);
				}

				return {
					path: joinWorkspaceItemPath(destination.path, item.name),
					previousPath: resolved.path,
					type: item.type,
				};
			}),
		);
		break;
	}

	return {
		failed,
		items,
	};
}

function resolveMoveWorkspaceDestination(input: { resolution: WorkspaceKernelPathResolution }):
	| {
			failure: MoveWorkspaceDestinationFailure;
			status: "failed";
	  }
	| {
			parentId: string | null;
			path: string;
			status: "destination";
	  } {
	const { resolution } = input;

	if (resolution.status === "invalid_path") {
		return {
			failure: {
				code: "destination_path_not_absolute",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	if (resolution.status === "not_found") {
		return {
			failure: {
				code: "destination_path_not_found",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	if (resolution.status === "root") {
		return {
			parentId: null,
			path: resolution.path,
			status: "destination",
		};
	}

	if (resolution.item.type !== "folder") {
		return {
			failure: {
				code: "destination_path_not_folder",
				path: resolution.path,
			},
			status: "failed",
		};
	}

	return {
		parentId: resolution.item.id,
		path: resolution.path,
		status: "destination",
	};
}

function isWorkspacePathEqualOrDescendant(ancestorPath: string, candidatePath: string) {
	return candidatePath === ancestorPath || candidatePath.startsWith(`${ancestorPath}/`);
}
