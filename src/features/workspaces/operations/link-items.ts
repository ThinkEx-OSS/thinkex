import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	resolveWorkspaceRelations,
	type WorkspaceRelationInput,
	workspaceRelationFailureCodes,
} from "#/features/workspaces/operations/relations";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	getAuthorizedWorkspaceKernel,
	resolveWorkspaceExistingItemPath,
} from "#/features/workspaces/operations/workspace-operation-context";

export interface LinkWorkspaceItemsOperationInput {
	path: string;
	relations: WorkspaceRelationInput[];
}

export const linkWorkspaceItemsFailureCodes = [
	"cannot_link_root",
	"path_not_absolute",
	"path_not_found",
	...workspaceRelationFailureCodes,
] as const;

type LinkWorkspaceItemsFailureCode = (typeof linkWorkspaceItemsFailureCodes)[number];

interface LinkWorkspaceItemsFailure {
	code: LinkWorkspaceItemsFailureCode;
	path: string;
}

export interface LinkWorkspaceItemsOperationResult {
	failed: LinkWorkspaceItemsFailure[];
	item?: {
		path: string;
		type: WorkspaceItemSummary["type"];
	};
}

export async function linkWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: LinkWorkspaceItemsOperationInput,
): Promise<LinkWorkspaceItemsOperationResult> {
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "mutate",
		context: accessContext,
	});
	const [pathResolution, ...relationTargets] = await kernel.resolvePaths({
		paths: [input.path, ...input.relations.map((relation) => relation.path)],
	});
	if (!pathResolution) {
		throw new Error("Workspace kernel did not resolve the requested link source.");
	}
	const resolution = resolveWorkspaceExistingItemPath({
		resolution: pathResolution,
		rootFailureCode: "cannot_link_root",
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

	const relations = resolveWorkspaceRelations({
		excludeItemId: resolution.item.id,
		fromItemId: resolution.item.id,
		relations: input.relations,
		targets: relationTargets,
	});

	if (relations.status === "failed") {
		return {
			failed: [
				{
					code: relations.failure.code,
					path: relations.failure.path,
				},
			],
		};
	}

	await kernel.linkItems({
		relations: relations.relations,
		actorUserId: accessContext.actor.userId,
		clientMutationId: accessContext.operationId,
	});

	return {
		failed: [],
		item: {
			path: resolution.path,
			type: resolution.item.type,
		},
	};
}
