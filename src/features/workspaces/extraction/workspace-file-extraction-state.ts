import type { WorkflowStep } from "cloudflare:workers";

import type {
	StagedPageProjection,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";

export async function markWorkspaceFileExtractionProcessing(
	env: Cloudflare.Env,
	step: WorkflowStep,
	params: WorkspaceFileExtractionWorkflowParams,
	runId: string,
) {
	await step.do("mark extraction processing", async () => {
		const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
		await kernel.upsertFileProjection({
			itemId: params.itemId,
			format: "pages",
			status: "processing",
			actorUserId: params.actorUserId,
			clientMutationId: `${runId}:projection:processing`,
		});

		return { status: "processing" };
	});
}

export function publishWorkspaceFileProjection(
	env: Cloudflare.Env,
	step: WorkflowStep,
	params: WorkspaceFileExtractionWorkflowParams,
	runId: string,
	extraction: StagedPageProjection,
	provisional: boolean,
) {
	return step.do(
		provisional ? "publish fast FileRouter projection" : "publish enhanced projection",
		{
			retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
			timeout: "5 minutes",
		},
		async () => {
			const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
			await kernel.upsertFileProjection({
				itemId: params.itemId,
				format: "pages",
				status: "ready",
				objectKey: extraction.manifestObjectKey,
				provider: extraction.provider,
				providerMode: extraction.providerMode,
				sourceHash: extraction.sourceHash,
				metadataJson: {
					...extraction.metadata,
					markdownLength: extraction.markdownLength,
					pageCount: extraction.pageCount,
					provisional,
					routeReason: extraction.routeReason,
				},
				actorUserId: params.actorUserId,
				clientMutationId: `${runId}:projection:${provisional ? "fast" : "enhanced"}-ready`,
			});

			return {
				pageCount: extraction.pageCount,
				provider: extraction.provider,
				providerMode: extraction.providerMode,
				status: "ready" as const,
			};
		},
	);
}

export async function markWorkspaceFileExtractionFailed(
	env: Cloudflare.Env,
	step: WorkflowStep,
	params: WorkspaceFileExtractionWorkflowParams,
	runId: string,
	error: unknown,
) {
	await step.do("mark extraction failed", async () => {
		const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
		const errorMessage = error instanceof Error ? error.message : String(error);
		await kernel.upsertFileProjection({
			itemId: params.itemId,
			format: "pages",
			status: "failed",
			errorMessage,
			actorUserId: params.actorUserId,
			clientMutationId: `${runId}:projection:failed`,
		});

		return { status: "failed", errorMessage };
	});
}
