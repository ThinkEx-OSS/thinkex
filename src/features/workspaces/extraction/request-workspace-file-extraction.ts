import { env } from "cloudflare:workers";

import { sha256Base64UrlText } from "#/features/workspaces/extraction/binary";
import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { getWorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel-access";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";

export async function requestWorkspaceFileExtraction(input: {
	workspaceId: string;
	itemId: string;
	actorUserId: string | null;
	assetKind: WorkspaceFileAssetKind;
}) {
	const kernel = await getWorkspaceKernel(input.workspaceId);
	const workflowId = await getWorkspaceFileExtractionWorkflowId(input);
	const params = {
		workspaceId: input.workspaceId,
		itemId: input.itemId,
		actorUserId: input.actorUserId,
		assetKind: input.assetKind,
	} satisfies WorkspaceFileExtractionWorkflowParams;

	await kernel.upsertFileProjection({
		itemId: input.itemId,
		format: "pages",
		status: "queued",
		actorUserId: input.actorUserId,
	});

	try {
		const [instance] = await env.WORKSPACE_FILE_EXTRACTION_WORKFLOW.createBatch([
			{
				id: workflowId,
				params,
			},
		]);

		return { workflowId, queued: Boolean(instance) };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Failed to queue extraction.";
		await kernel.upsertFileProjection({
			itemId: input.itemId,
			format: "pages",
			status: "failed",
			errorMessage,
			actorUserId: input.actorUserId,
		});

		throw error;
	}
}

async function getWorkspaceFileExtractionWorkflowId(input: {
	workspaceId: string;
	itemId: string;
	assetKind: WorkspaceFileAssetKind;
}) {
	const digest = await sha256Base64UrlText(
		`${input.workspaceId}:${input.itemId}:${input.assetKind}-extraction:v1`,
	);

	return `${input.assetKind}-${digest.slice(0, 48)}`;
}
