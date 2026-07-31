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
		projection_updated_at: number;
	}>`
		SELECT
			json_extract(i.metadata_json, '$.assetKind') AS asset_kind,
			i.id,
			i.object_key,
			COALESCE(p.updated_at, i.created_at) AS projection_updated_at
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
	for (let offset = 0; offset < candidates.length; offset += workflowBatchSize) {
		const workflows = (
			await Promise.all(
				candidates.slice(offset, offset + workflowBatchSize).map(async (candidate) => {
					const assetKind = workspaceFileAssetKindSchema.safeParse(candidate.asset_kind);
					if (!assetKind.success) {
						return null;
					}

					const runKey = `${extractionHealingVersion}:${candidate.object_key}:${candidate.projection_updated_at}`;
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
		if (workflows.length > 0) {
			await input.workflow.createBatch(workflows);
		}
	}
}
