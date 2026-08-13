import type { WorkflowStep } from "cloudflare:workers";

import { extractPdfWithLiteParse } from "#/features/workspaces/extraction/providers/liteparse";
import {
	getWorkspaceExtractionStepConfig,
	workspaceExtractionStepBudgets,
} from "#/features/workspaces/extraction/workspace-extraction-budgets";
import type {
	LiteParseStageOutcome,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { publishWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

export async function publishLiteParseProjection(
	env: Cloudflare.Env,
	step: WorkflowStep,
	params: WorkspaceFileExtractionWorkflowParams,
	runId: string,
): Promise<LiteParseStageOutcome | { durationMs: number; outcome: "discarded" }> {
	if (params.assetKind !== "pdf") {
		return { durationMs: 0, outcome: "skipped" };
	}

	const startedAt = Date.now();

	try {
		return await step.do(
			"publish fast LiteParse projection",
			getWorkspaceExtractionStepConfig(workspaceExtractionStepBudgets.liteParse),
			async () => {
				const { object, source } = await getWorkspaceFileSourceObject({
					env,
					itemId: params.itemId,
					workspaceId: params.workspaceId,
				});
				const projection = await publishWorkspacePageProjection({
					itemId: params.itemId,
					workspaceId: params.workspaceId,
					pages: extractPdfWithLiteParse(env, {
						body: object.body,
						fileName: source.fileName,
						sizeBytes: source.sizeBytes,
					}),
					provider: "liteparse",
					providerMode: "fast",
					sourceHash: object.etag,
					tier: "fast",
					metadata: { provisional: true },
					actorUserId: params.actorUserId,
				});
				if (projection.status === "discarded") {
					return {
						durationMs: Date.now() - startedAt,
						outcome: "discarded" as const,
					};
				}

				return {
					durationMs: Date.now() - startedAt,
					markdownLength: projection.markdownLength,
					outcome: "success" as const,
					pageCount: projection.pageCount,
				};
			},
		);
	} catch (error) {
		recordOperationalFailure({
			distinctId: params.actorUserId ?? undefined,
			error,
			event: "workspace_liteparse_projection",
			fields: {
				item_id: params.itemId,
				request_id: params.requestId,
				workflow_id: runId,
				workspace_id: params.workspaceId,
			},
		});
		return {
			durationMs: Date.now() - startedAt,
			errorMessage: error instanceof Error ? error.message : String(error),
			errorType: error instanceof Error ? error.name : "UnknownError",
			outcome: "error",
		};
	}
}
