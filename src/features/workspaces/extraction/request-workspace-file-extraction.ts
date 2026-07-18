import { env } from "cloudflare:workers";

import { sha256Base64UrlText } from "#/features/workspaces/extraction/binary";
import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { getWorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel-access";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
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
		workflowId = await getWorkspaceFileExtractionWorkflowId(input);
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
			const kernel = await getWorkspaceKernel(input.workspaceId);
			const errorMessage = error instanceof Error ? error.message : "Failed to queue extraction.";
			await kernel.upsertFileProjection({
				itemId: input.itemId,
				format: "pages",
				status: "failed",
				errorMessage,
				actorUserId: input.actorUserId,
				clientMutationId: `${input.requestId}:projection:queue-failed`,
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

async function getWorkspaceFileExtractionWorkflowId(input: {
	workspaceId: string;
	itemId: string;
	assetKind: WorkspaceFileAssetKind;
}) {
	const digest = await sha256Base64UrlText(
		`${input.workspaceId}:${input.itemId}:${input.assetKind}-extraction:v2`,
	);

	return `${input.assetKind}-${digest.slice(0, 48)}`;
}
