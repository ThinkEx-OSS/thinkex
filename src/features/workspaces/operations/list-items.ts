import { getWorkspaceOperationContext } from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	listWorkspaceKernelTreeItems,
	type ListWorkspaceKernelItemsResult,
} from "#/features/workspaces/kernel/workspace-kernel-list";

export interface ListWorkspaceItemsOperationInput {
	cursor?: string;
	limit?: number;
	path?: string;
	recursive?: boolean;
}

export async function listWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: ListWorkspaceItemsOperationInput,
): Promise<ListWorkspaceKernelItemsResult> {
	const workspaceContext = await getWorkspaceOperationContext({
		access: "read",
		context: accessContext,
	});

	return listWorkspaceKernelTreeItems({
		tree: workspaceContext.tree,
		itemFactsById: workspaceContext.itemFactsById,
		cursor: input.cursor,
		path: input.path,
		recursive: input.recursive,
		limit: input.limit,
	});
}
