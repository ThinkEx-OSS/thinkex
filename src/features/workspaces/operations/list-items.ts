import { getAuthorizedWorkspaceKernel } from "#/features/workspaces/operations/workspace-operation-context";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import type { ListWorkspaceKernelItemsResult } from "#/features/workspaces/kernel/workspace-kernel-list";

export interface ListWorkspaceItemsOperationInput {
	limit?: number;
	offset?: number;
	path?: string;
	recursive?: boolean;
}

export async function listWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: ListWorkspaceItemsOperationInput,
): Promise<ListWorkspaceKernelItemsResult> {
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "read",
		context: accessContext,
	});

	return await kernel.listTreeItems({
		offset: input.offset,
		path: input.path,
		recursive: input.recursive,
		limit: input.limit,
	});
}
