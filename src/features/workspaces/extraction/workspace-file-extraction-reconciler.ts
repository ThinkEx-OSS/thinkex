import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { getWorkspaceFileExtractionWorkflowId } from "#/features/workspaces/extraction/workspace-file-extraction-workflow-id";
import { workspaceExtractionStallThresholdMs } from "#/features/workspaces/extraction/workspace-projection-readiness";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";

const extractionHealingVersion = "extraction-healing-v1";
const failedExtractionCooldownMs = 15 * 60_000;
const workflowBatchSize = 100;

export async function reconcileWorkspaceFileExtractions(input: {
	sql: WorkspaceKernelSql;
	workflow: Workflow<WorkspaceFileExtractionWorkflowParams>;
	workspaceId: string;
}) {
	const now = Date.now();
	const candidates = input.sql<{
		asset_kind: string | number | boolean | null;
		id: string;
		object_key: string;
	}>`
		SELECT
			json_extract(i.metadata_json, '$.assetKind') AS asset_kind,
			i.id,
			i.object_key
		FROM kernel_items i
		LEFT JOIN kernel_item_projections p
			ON p.item_id = i.id AND p.format = 'pages'
		WHERE i.deleted_at IS NULL
			AND i.type = 'file'
			AND i.object_key IS NOT NULL
			AND (
				(p.item_id IS NULL AND i.created_at <= ${now - workspaceExtractionStallThresholdMs})
				OR (
					p.status = 'failed'
					AND p.updated_at <= ${now - failedExtractionCooldownMs}
				)
				OR (
					p.status = 'processing'
					AND p.updated_at <= ${now - workspaceExtractionStallThresholdMs}
				)
				OR (
					p.status = 'ready'
					AND (p.object_key IS NULL OR p.source_hash IS NULL)
					AND p.updated_at <= ${now - workspaceExtractionStallThresholdMs}
				)
			)
			ORDER BY i.created_at ASC
		`;
	const workflows = (
		await Promise.all(
			candidates.map(async (candidate) => {
				const assetKind = workspaceFileAssetKindSchema.safeParse(candidate.asset_kind);
				if (!assetKind.success) {
					return null;
				}

				const runKey = `${extractionHealingVersion}:${candidate.object_key}`;
				const params = {
					actorUserId: null,
					assetKind: assetKind.data,
					itemId: candidate.id,
					requestId: extractionHealingVersion,
					workspaceId: input.workspaceId,
				} satisfies WorkspaceFileExtractionWorkflowParams;
				return {
					id: await getWorkspaceFileExtractionWorkflowId({
						assetKind: params.assetKind,
						itemId: candidate.id,
						runKey,
						workspaceId: input.workspaceId,
					}),
					params,
				};
			}),
		)
	).filter((workflow) => workflow !== null);

	// Workflow batches are capped at 100; submit every eligible file without
	// opening unbounded concurrent calls to the service.
	for (let offset = 0; offset < workflows.length; offset += workflowBatchSize) {
		await input.workflow.createBatch(workflows.slice(offset, offset + workflowBatchSize));
	}
}
