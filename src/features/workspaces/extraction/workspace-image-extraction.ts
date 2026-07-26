import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";

import type {
	StagedPageProjection,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { recordWorkspaceFileExtractionOutcome } from "#/features/workspaces/extraction/workspace-file-extraction-observability";
import {
	markWorkspaceFileExtractionFailed,
	publishWorkspaceFileProjection,
} from "#/features/workspaces/extraction/workspace-file-extraction-state";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { writeWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { extractImageWithWorkersAi } from "#/features/workspaces/extraction/workers-ai-image-extraction";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

export async function runWorkspaceImageExtraction(input: {
	env: Cloudflare.Env;
	event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>;
	params: WorkspaceFileExtractionWorkflowParams;
	schedule: PostHogTelemetryScheduler;
	step: WorkflowStep;
}) {
	const startedAt = Date.now();
	const liteParse = { durationMs: 0, outcome: "skipped" as const };

	try {
		const extraction = await input.step.do(
			"extract image with Workers AI",
			{
				retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
				timeout: "10 minutes",
			},
			() => stageImageProjection(input),
		);
		const result = await publishWorkspaceFileProjection(
			input.env,
			input.step,
			input.params,
			input.event.instanceId,
			extraction,
			false,
		);

		await input.step.do("record extraction outcome", async () => {
			recordWorkspaceFileExtractionOutcome({
				durationMs: Date.now() - input.event.timestamp.getTime(),
				enhancement: {
					durationMs: Date.now() - startedAt,
					outcome: "success",
				},
				instanceId: input.event.instanceId,
				liteParse,
				outcome: "success",
				pageCount: extraction.pageCount,
				params: input.params,
				provider: extraction.provider,
				providerMode: extraction.providerMode,
				routeReason: extraction.routeReason,
				schedule: input.schedule,
			});

			return { outcome: "success" };
		});

		return result;
	} catch (error) {
		await markWorkspaceFileExtractionFailed(
			input.env,
			input.step,
			input.params,
			input.event.instanceId,
			error,
		);
		await input.step.do("record extraction failure", async () => {
			recordWorkspaceFileExtractionOutcome({
				durationMs: Date.now() - input.event.timestamp.getTime(),
				enhancement: {
					durationMs: Date.now() - startedAt,
					error,
					outcome: "error",
				},
				error,
				instanceId: input.event.instanceId,
				liteParse,
				outcome: "error",
				params: input.params,
				schedule: input.schedule,
			});

			return { outcome: "error" };
		});

		throw error;
	}
}

async function stageImageProjection(
	input: Parameters<typeof runWorkspaceImageExtraction>[0],
): Promise<StagedPageProjection> {
	const kernel = await getWorkspaceKernelFromEnv(input.env, input.params.workspaceId);
	const { object, source } = await getWorkspaceFileSourceObject({
		env: input.env,
		itemId: input.params.itemId,
		kernel,
	});
	const result = await extractImageWithWorkersAi(input.env, {
		body: object.body,
		fileName: source.fileName,
	});
	const projection = await writeWorkspacePageProjection({
		bucket: input.env.WORKSPACE_KERNEL_FILES,
		itemId: input.params.itemId,
		metadata: result.metadata,
		pages: result.pages,
		provider: result.provider,
		providerMode: result.providerMode,
		runId: input.event.instanceId,
		sourceHash: object.etag,
		tier: "enhanced",
		workspaceId: input.params.workspaceId,
	});

	return {
		manifestObjectKey: projection.manifestObjectKey,
		markdownLength: projection.manifest.markdownLength,
		metadata: result.metadata,
		pageCount: projection.manifest.pageCount,
		provider: result.provider,
		providerMode: result.providerMode,
		routeReason: "workers_ai_image_to_markdown",
		sourceHash: object.etag,
	};
}
