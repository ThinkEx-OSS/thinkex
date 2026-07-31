import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { getWorkspaceFileExtractionWorkflowId } from "#/features/workspaces/extraction/workspace-file-extraction-workflow-id";
import { workspaceExtractionStallThresholdMs } from "#/features/workspaces/extraction/workspace-projection-readiness";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";

const extractionHealingVersion = "extraction-healing-v1";
const failedExtractionCooldownMs = 15 * 60_000;
const missingProjectionGraceMs = workspaceExtractionStallThresholdMs;
const workflowBatchSize = 100;

export async function reconcileWorkspaceFileExtractions(input: {
	items: readonly WorkspaceItemSummary[];
	sql: WorkspaceKernelSql;
	workflow: Workflow<WorkspaceFileExtractionWorkflowParams>;
	workspaceId: string;
}) {
	const now = Date.now();
	const candidates = input.sql<{
		id: string;
		object_key: string;
		projection_status: string | null;
		projection_updated_at: number | null;
	}>`
		SELECT
			i.id,
			i.object_key,
			p.status AS projection_status,
			p.updated_at AS projection_updated_at
		FROM kernel_items i
		LEFT JOIN kernel_item_projections p
			ON p.item_id = i.id AND p.format = 'pages'
		WHERE i.deleted_at IS NULL
			AND i.type = 'file'
			AND i.object_key IS NOT NULL
			AND (
				(p.item_id IS NULL AND i.created_at <= ${now - missingProjectionGraceMs})
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
					AND p.updated_at <= ${now - missingProjectionGraceMs}
				)
			)
		ORDER BY i.created_at ASC
		LIMIT ${workflowBatchSize}
	`;
	const itemsById = new Map(input.items.map((item) => [item.id, item]));
	const workflows: Array<{
		id: string;
		params: WorkspaceFileExtractionWorkflowParams;
	}> = [];

	for (const candidate of candidates) {
		const item = itemsById.get(candidate.id);
		if (!item) {
			continue;
		}

		const fileType = resolveWorkspaceFileTypeFromItem(item);
		if (!fileType) {
			continue;
		}

		const runKey = [
			extractionHealingVersion,
			candidate.object_key,
			candidate.projection_status ?? "missing",
			candidate.projection_updated_at ?? 0,
		].join(":");
		const params = {
			actorUserId: null,
			assetKind: fileType.assetKind,
			itemId: item.id,
			requestId: extractionHealingVersion,
			workspaceId: input.workspaceId,
		} satisfies WorkspaceFileExtractionWorkflowParams;
		workflows.push({
			id: await getWorkspaceFileExtractionWorkflowId({
				assetKind: params.assetKind,
				itemId: item.id,
				runKey,
				workspaceId: input.workspaceId,
			}),
			params,
		});
	}

	if (workflows.length === 0) {
		return;
	}

	await input.workflow.createBatch(workflows);
}
