import { env } from "cloudflare:workers";

import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { getWorkspaceFileExtractionWorkflowId } from "#/features/workspaces/extraction/workspace-file-extraction-workflow-id";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
import { updateWorkspaceFileExtraction } from "#/features/workspaces/persistence/workspace-files";
import { trackWorkspaceFileUploadUsage } from "#/integrations/autumn/workspace-file-usage";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

export async function requestWorkspaceFileExtraction(input: {
	workspaceId: string;
	itemId: string;
	actorUserId: string | null;
	assetKind: WorkspaceFileAssetKind;
	requestId: string;
}) {
	let workflowId: string | null = null;

	try {
		workflowId = await getWorkspaceFileExtractionWorkflowId({
			...input,
			runKey: "initial",
		});
		const params = {
			workspaceId: input.workspaceId,
			itemId: input.itemId,
			actorUserId: input.actorUserId,
			assetKind: input.assetKind,
			requestId: input.requestId,
		} satisfies WorkspaceFileExtractionWorkflowParams;
		await env.WORKSPACE_FILE_EXTRACTION_WORKFLOW.createBatch([
			{
				id: workflowId,
				params,
			},
		]);

		// After the workflow is queued, so a failed enqueue doesn't bill the user
		// for an extraction that never ran.
		await trackWorkspaceFileUploadUsage({
			assetKind: input.assetKind,
			env,
			itemId: input.itemId,
			userId: input.actorUserId,
			workspaceId: input.workspaceId,
		});
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.actorUserId ?? undefined,
			error,
			event: "workspace_file_extraction_queue",
			fields: {
				actor_user_id: input.actorUserId,
				asset_kind: input.assetKind,
				item_id: input.itemId,
				request_id: input.requestId,
				workflow_id: workflowId,
				workspace_id: input.workspaceId,
			},
		});

		try {
			const errorMessage = error instanceof Error ? error.message : "Failed to queue extraction.";
			await updateWorkspaceFileExtraction({
				itemId: input.itemId,
				workspaceId: input.workspaceId,
				status: "failed",
				errorMessage,
				actorUserId: input.actorUserId,
			});
		} catch (statusError) {
			recordOperationalFailure({
				distinctId: input.actorUserId ?? undefined,
				error: statusError,
				event: "workspace_file_extraction_queue_status",
				fields: {
					item_id: input.itemId,
					request_id: input.requestId,
					workflow_id: workflowId,
					workspace_id: input.workspaceId,
				},
			});
		}
	}
}
