import type { WorkspaceItem } from "#/features/workspaces/contracts";
import {
	resolveWorkspaceRelations,
	type WorkspaceRelationInput,
} from "#/features/workspaces/operations/relations";
import { linkWorkspaceItemsFailureCodes } from "#/features/workspaces/operations/workspace-operation-failure-codes";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	authorizeWorkspaceOperation,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import type { CreateWorkspaceRelationArgs } from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	linkWorkspaceItems,
	resolveWorkspacePaths,
} from "#/features/workspaces/persistence/workspace-items";

export interface LinkWorkspaceItemsOperationInput {
	items: Array<{
		path: string;
		relations: WorkspaceRelationInput[];
	}>;
}

type LinkWorkspaceItemsFailureCode = (typeof linkWorkspaceItemsFailureCodes)[number];

export interface LinkWorkspaceItemsFailure {
	code: LinkWorkspaceItemsFailureCode;
	index: number;
	path: string;
}

export interface LinkedWorkspaceItem {
	path: string;
	type: WorkspaceItem["type"];
}

export interface LinkWorkspaceItemsOperationResult {
	failed: LinkWorkspaceItemsFailure[];
	items: LinkedWorkspaceItem[];
}

export async function linkWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: LinkWorkspaceItemsOperationInput,
): Promise<LinkWorkspaceItemsOperationResult> {
	await authorizeWorkspaceOperation({
		access: "mutate",
		context: accessContext,
	});

	const paths = input.items.flatMap((item) => [
		item.path,
		...item.relations.map((relation) => relation.path),
	]);
	const resolutions = await resolveWorkspacePaths({
		workspaceId: accessContext.workspaceId,
		paths,
	});

	const failed: LinkWorkspaceItemsFailure[] = [];
	const items: LinkedWorkspaceItem[] = [];
	const relationsToWrite: CreateWorkspaceRelationArgs[] = [];
	let offset = 0;

	for (const [index, itemInput] of input.items.entries()) {
		const sourceResolution = resolutions[offset];
		offset += 1;
		const relationTargets = resolutions.slice(offset, offset + itemInput.relations.length);
		offset += itemInput.relations.length;

		if (!sourceResolution) {
			throw new Error("Workspace persistence did not resolve the requested link source.");
		}

		const resolution = resolveWorkspaceExistingItemPath({
			resolution: sourceResolution,
			rootFailureCode: "cannot_link_root",
		});

		if (resolution.status === "failed") {
			failed.push({
				code: resolution.failure.code,
				index,
				path: resolution.failure.path,
			});
			continue;
		}

		const relations = resolveWorkspaceRelations({
			excludeItemId: resolution.item.id,
			fromItemId: resolution.item.id,
			relations: itemInput.relations,
			targets: relationTargets,
		});

		if (relations.status === "failed") {
			failed.push({
				code: relations.failure.code,
				index,
				path: relations.failure.path,
			});
			continue;
		}

		relationsToWrite.push(...relations.relations);
		items.push({
			path: resolution.path,
			type: resolution.item.type,
		});
	}

	if (relationsToWrite.length > 0) {
		await linkWorkspaceItems({
			relations: relationsToWrite,
			actorUserId: accessContext.actor.userId,
			workspaceId: accessContext.workspaceId,
		});
	}

	return {
		failed,
		items,
	};
}
