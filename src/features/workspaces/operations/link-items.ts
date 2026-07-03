import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	resolveWorkspaceRelations,
	type WorkspaceRelationInput,
	workspaceRelationFailureCodes,
} from "#/features/workspaces/operations/relations";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	getWorkspaceOperationContext,
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
	const workspaceContext = await getWorkspaceOperationContext({
		access: "mutate",
		context: accessContext,
	});
	const resolution = resolveWorkspaceExistingItemPath({
		path: input.path,
		rootFailureCode: "cannot_link_root",
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

	const relations = resolveWorkspaceRelations({
		excludeItemId: resolution.item.id,
		fromItemId: resolution.item.id,
		relations: input.relations,
		tree: workspaceContext.tree,
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

	await workspaceContext.kernel.createRelations({ relations: relations.relations });

	return {
		failed: [],
		item: {
			path: resolution.path,
			type: resolution.item.type,
		},
	};
}
