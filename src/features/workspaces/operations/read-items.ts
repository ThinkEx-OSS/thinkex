import { env } from "cloudflare:workers";

import {
	type WorkspaceContentReadRequest,
	type WorkspaceReadItemsOutput,
} from "#/features/workspaces/content/workspace-content-contract";
import { readWorkspaceContent } from "#/features/workspaces/content/workspace-content-reader";
import { recordWorkspaceFileReadOutcomes } from "#/features/workspaces/content/workspace-read-observability";
import { createWorkspaceReadReferences } from "#/features/workspaces/content/workspace-read-references";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { getAuthorizedWorkspaceKernel } from "#/features/workspaces/operations/workspace-operation-context";

export interface ReadWorkspaceItemsOperationInput {
	requests: WorkspaceContentReadRequest[];
}

export async function readWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: ReadWorkspaceItemsOperationInput,
): Promise<WorkspaceReadItemsOutput> {
	const kernel = await getAuthorizedWorkspaceKernel({
		access: "read",
		context: accessContext,
	});
	const results = await readWorkspaceContent({
		bucket: env.WORKSPACE_KERNEL_FILES,
		getDocumentSession: (itemId) =>
			getDocumentSessionFromEnv(env, {
				itemId,
				workspaceId: accessContext.workspaceId,
			}),
		kernel,
		requests: input.requests,
	});

	recordWorkspaceFileReadOutcomes({
		operationId: accessContext.operationId,
		results,
		userId: accessContext.actor.userId,
		workspaceId: accessContext.workspaceId,
	});

	return {
		references: createWorkspaceReadReferences(results),
		results,
	};
}
