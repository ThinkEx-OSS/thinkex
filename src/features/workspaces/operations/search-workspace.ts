import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { getAuthorizedWorkspaceKernel } from "#/features/workspaces/operations/workspace-operation-context";
import type {
	WorkspaceSearchInput,
	WorkspaceSearchOutput,
} from "#/features/workspaces/search/workspace-search-contract";
import { createWorkspaceSearchReferences } from "#/features/workspaces/search/workspace-search-references";

export async function searchWorkspaceOperation(
	accessContext: WorkspaceAccessContext,
	input: WorkspaceSearchInput,
): Promise<WorkspaceSearchOutput> {
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "read",
		context: accessContext,
	});
	const output = await kernel.searchWorkspace(input);

	return {
		...output,
		references: createWorkspaceSearchReferences(output.results),
	};
}
