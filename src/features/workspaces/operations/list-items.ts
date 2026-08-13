import { authorizeWorkspaceOperation } from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { ListWorkspaceItemsResult } from "#/features/workspaces/model/workspace-tree-list";
import { listWorkspaceTreeItems } from "#/features/workspaces/persistence/workspace-items";

export interface ListWorkspaceItemsOperationInput {
	offset?: number;
	path?: string;
	recursive?: boolean;
}

export async function listWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: ListWorkspaceItemsOperationInput,
): Promise<ListWorkspaceItemsResult> {
	await authorizeWorkspaceOperation({
		access: "read",
		context: accessContext,
	});

	return await listWorkspaceTreeItems({
		offset: input.offset,
		path: input.path,
		recursive: input.recursive,
		workspaceId: accessContext.workspaceId,
	});
}
