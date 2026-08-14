import { env } from "cloudflare:workers";

import {
	type WorkspaceContentReadRequest,
	type WorkspaceReadItemsOutput,
} from "#/features/workspaces/content/workspace-content-contract";
import { readWorkspaceContent } from "#/features/workspaces/content/workspace-content-reader";
import { recordWorkspaceFileReadOutcomes } from "#/features/workspaces/content/workspace-read-observability";
import { createWorkspaceReadReferences } from "#/features/workspaces/content/workspace-read-references";
import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import { readFlashcardViewer } from "#/features/workspaces/flashcards/flashcard-study-persistence";
import {
	indexWorkspaceReferenceRecords,
	parseWorkspaceReference,
} from "#/features/workspaces/locations/workspace-location";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { authorizeWorkspaceOperation } from "#/features/workspaces/operations/workspace-operation-context";

export interface ReadWorkspaceItemsOperationInput {
	requests: WorkspaceContentReadRequest[];
}

export async function readWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: ReadWorkspaceItemsOperationInput,
): Promise<WorkspaceReadItemsOutput> {
	await authorizeWorkspaceOperation({
		access: "read",
		context: accessContext,
	});
	const requestedRefs = input.requests.flatMap((request) =>
		request.mode === "ref" ? [request.ref] : [],
	);
	const referenceTargets = indexWorkspaceReferenceRecords(
		requestedRefs.length > 0 && accessContext.resolveWorkspaceReferences
			? await accessContext.resolveWorkspaceReferences(requestedRefs)
			: [],
	);
	const results = await readWorkspaceContent({
		bucket: env.WORKSPACE_FILES,
		getDocumentSession: (itemId) =>
			getDocumentSessionFromEnv(env, {
				itemId,
				workspaceId: accessContext.workspaceId,
			}),
		readFlashcardItem: (itemId) =>
			readFlashcardViewer({
				itemId,
				userId: accessContext.actor.userId,
				workspaceId: accessContext.workspaceId,
			}),
		resolveReference: (itemId, ref) => {
			const parsedRef = parseWorkspaceReference(ref);
			const record = parsedRef ? referenceTargets.get(parsedRef) : undefined;
			return record?.location.itemId === itemId ? record.location : undefined;
		},
		requests: input.requests,
		workspaceId: accessContext.workspaceId,
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
