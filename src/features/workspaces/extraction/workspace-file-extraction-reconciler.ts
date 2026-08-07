import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";
import { getWorkspaceFileExtractionWorkflowId } from "#/features/workspaces/extraction/workspace-file-extraction-workflow-id";
import { workspaceExtractionStallThresholdMs } from "#/features/workspaces/extraction/workspace-extraction-budgets";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { workspaceFileAssetKindSchema } from "#/features/workspaces/model/workspace-file";

const extractionHealingVersion = "extraction-healing-v1";
const failedExtractionCooldownMs = 15 * 60_000;
const workflowBatchSize = 100;

export async function reconcileWorkspaceFileExtractions(input: {
	schedule?: (task: Promise<void>) => void;
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
		reason: string;
	}>`
		SELECT
			json_extract(i.metadata_json, '$.assetKind') AS asset_kind,
			i.id,
			i.object_key,
			COALESCE(p.updated_at, i.created_at) AS projection_updated_at,
			CASE
				WHEN p.item_id IS NULL THEN 'missing'
				WHEN p.status = 'failed' THEN 'failed'
				WHEN p.status = 'processing' THEN 'stalled'
				WHEN p.object_key IS NULL OR p.source_hash IS NULL THEN 'unreadable'
				ELSE 'provisional'
			END AS reason
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
				-- A provisional row means the fast pass published and the enhanced pass
				-- failed: readable, but stuck at fast-tier quality with nothing else
				-- revisiting it. Heal it once — a healing run brands the row it
				-- republishes, and branded rows are never picked up again, so a
				-- persistently failing document cannot become a paid retry per sweep.
				OR (
					p.status = 'ready'
					AND json_extract(p.metadata_json, '$.provisional') = 1
					AND json_extract(p.metadata_json, '$.healed') IS NULL
					AND p.updated_at <= ${now - workspaceExtractionStallThresholdMs}
				)
			)
			ORDER BY i.created_at ASC
		`;
	// A workspace reappearing here every sweep is a healing loop.
	if (candidates.length > 0) {
		const counts = { failed: 0, missing: 0, provisional: 0, stalled: 0, unreadable: 0 };
		for (const candidate of candidates) {
			if (candidate.reason in counts) {
				counts[candidate.reason as keyof typeof counts] += 1;
			}
		}
		capturePostHogServerEvent({
			distinctId: input.workspaceId,
			event: "workspace_file_extraction_healing_enqueued",
			consentExempt: true,
			processPerson: false,
			properties: { ...counts, total: candidates.length, workspace_id: input.workspaceId },
			schedule: input.schedule,
		});
	}

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
						healing: true,
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
