import type { WorkflowStep } from "cloudflare:workers";

import { extractPdfWithLiteParse } from "#/features/workspaces/extraction/providers/liteparse";
import type {
	LiteParseStageOutcome,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import {
	publishWorkspacePageProjection,
	writeWorkspacePageProjection,
} from "#/features/workspaces/extraction/workspace-page-projection";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
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
			{
				retries: { limit: 1, delay: "15 seconds", backoff: "constant" },
				// Parsing is fast — measured 2.3s for a 1,527-page file — but this step also
				// writes one R2 object per page, which costs roughly 45ms per page. At the
				// container's 5,000-page ceiling that is about four minutes of writes, so a
				// two-minute budget failed long documents that were working correctly.
				timeout: "8 minutes",
			},
			async () => {
				const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
				const { object, source } = await getWorkspaceFileSourceObject({
					env,
					itemId: params.itemId,
					kernel,
				});
				const projection = await writeWorkspacePageProjection({
					bucket: env.WORKSPACE_KERNEL_FILES,
					itemId: params.itemId,
					pages: extractPdfWithLiteParse(env, {
						body: object.body,
						fileName: source.fileName,
						sizeBytes: source.sizeBytes,
					}),
					provider: "liteparse",
					providerMode: "fast",
					runId,
					sourceHash: object.etag,
					tier: "fast",
					workspaceId: params.workspaceId,
				});

				const status = await publishWorkspacePageProjection({
					bucket: env.WORKSPACE_KERNEL_FILES,
					kernel,
					projection: {
						itemId: params.itemId,
						format: "pages",
						status: "ready",
						objectKey: projection.manifestObjectKey,
						provider: "liteparse",
						providerMode: "fast",
						sourceHash: object.etag,
						metadataJson: {
							markdownLength: projection.manifest.markdownLength,
							pageCount: projection.manifest.pageCount,
							provisional: true,
						},
						actorUserId: params.actorUserId,
						clientMutationId: `${runId}:projection:liteparse-ready`,
					},
				});
				if (status === "discarded") {
					return {
						durationMs: Date.now() - startedAt,
						outcome: "discarded" as const,
					};
				}

				return {
					durationMs: Date.now() - startedAt,
					markdownLength: projection.manifest.markdownLength,
					outcome: "success" as const,
					pageCount: projection.manifest.pageCount,
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
			errorType: error instanceof Error ? error.name : "UnknownError",
			outcome: "error",
		};
	}
}
