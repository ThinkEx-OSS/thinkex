import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { publishLiteParseProjection } from "#/features/workspaces/extraction/liteparse-projection";
import { recordWorkspaceFileExtractionOutcome } from "#/features/workspaces/extraction/workspace-file-extraction-observability";
import { createMarkdownExtractionProvider } from "#/features/workspaces/extraction/providers/index";
import type {
	MarkdownExtractionProviderId,
	MarkdownExtractionProviderMode,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { writeWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
import { getWorkspaceUploadFamily } from "#/features/workspaces/model/workspace-file";

export class WorkspaceFileExtractionWorkflow extends WorkflowEntrypoint<
	Cloudflare.Env,
	WorkspaceFileExtractionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>,
		step: WorkflowStep,
	) {
		const params = assertWorkflowParams(event.payload);
		const schedule = (task: Promise<void>) => this.ctx.waitUntil(task);

		await step.do("mark extraction processing", async () => {
			const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
			await kernel.upsertFileProjection({
				itemId: params.itemId,
				format: "pages",
				status: "processing",
				actorUserId: params.actorUserId,
				clientMutationId: `${event.instanceId}:projection:processing`,
			});

			return { status: "processing" };
		});

		const liteParse = await publishLiteParseProjection(this.env, step, params, event.instanceId);
		const enhancementStartedAt = Date.now();
		let extraction: StagedPageExtractionResult;
		let result: {
			pageCount: number;
			provider: MarkdownExtractionProviderId;
			providerMode: MarkdownExtractionProviderMode;
			status: "ready";
		};

		try {
			extraction = await step.do(
				"extract page markdown with provider",
				{
					retries: {
						limit: 2,
						delay: "30 seconds",
						backoff: "exponential",
					},
					timeout: "10 minutes",
				},
				async (): Promise<StagedPageExtractionResult> => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
					const { object, source } = await getWorkspaceFileSourceObject({
						env: this.env,
						itemId: params.itemId,
						kernel,
					});
					const route = getWorkspaceUploadFamily(params.assetKind).extractionRoute;
					const provider = createMarkdownExtractionProvider(route.provider, this.env);
					const extraction = await provider.extract({
						workspaceId: params.workspaceId,
						itemId: params.itemId,
						body: object.body,
						fileName: source.fileName,
						contentType: source.contentType,
						sizeBytes: source.sizeBytes,
						sourceHash: object.etag,
						mode: route.mode,
					});

					const projection = await writeWorkspacePageProjection({
						bucket: this.env.WORKSPACE_KERNEL_FILES,
						itemId: params.itemId,
						metadata: extraction.metadata,
						pages: extraction.pages,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						runId: event.instanceId,
						sourceHash: object.etag,
						tier: "enhanced",
						workspaceId: params.workspaceId,
					});

					return {
						hasExtractableText: projection.hasExtractableText,
						manifestObjectKey: projection.manifestObjectKey,
						markdownLength: projection.manifest.markdownLength,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						metadata: extraction.metadata,
						pageCount: projection.manifest.pageCount,
						routeReason: route.reason,
						sourceHash: object.etag,
					};
				},
			);

			result = await step.do(
				"write extracted projections",
				{
					retries: {
						limit: 3,
						delay: "10 seconds",
						backoff: "exponential",
					},
					timeout: "5 minutes",
				},
				async () => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
					const metadataJson = {
						...extraction.metadata,
						routeReason: extraction.routeReason,
						pageCount: extraction.pageCount,
						markdownLength: extraction.markdownLength,
						hasExtractableText: extraction.hasExtractableText,
					};

					await kernel.upsertFileProjection({
						itemId: params.itemId,
						format: "pages",
						status: "ready",
						objectKey: extraction.manifestObjectKey,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						sourceHash: extraction.sourceHash,
						metadataJson,
						actorUserId: params.actorUserId,
						clientMutationId: `${event.instanceId}:projection:enhanced-ready`,
					});

					return {
						status: "ready" as const,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						pageCount: extraction.pageCount,
					};
				},
			);
		} catch (error) {
			if (liteParse.outcome === "success") {
				await step.do("record partial extraction outcome", async () => {
					recordWorkspaceFileExtractionOutcome({
						durationMs: Date.now() - event.timestamp.getTime(),
						enhancement: {
							durationMs: Date.now() - enhancementStartedAt,
							error,
							outcome: "error",
						},
						instanceId: event.instanceId,
						liteParse,
						outcome: "partial",
						pageCount: liteParse.pageCount,
						params,
						provider: "liteparse",
						providerMode: "fast",
						routeReason: "LiteParse projection retained after enhancement failed.",
						schedule,
					});

					return { outcome: "partial" };
				});

				return {
					pageCount: liteParse.pageCount,
					provider: "liteparse",
					providerMode: "fast",
					status: "ready",
				};
			}

			await step.do("mark extraction failed", async () => {
				const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
				const errorMessage = getErrorMessage(error);
				await kernel.upsertFileProjection({
					itemId: params.itemId,
					format: "pages",
					status: "failed",
					errorMessage,
					actorUserId: params.actorUserId,
					clientMutationId: `${event.instanceId}:projection:failed`,
				});

				return { status: "failed", errorMessage };
			});

			await step.do("record extraction failure", async () => {
				recordWorkspaceFileExtractionOutcome({
					durationMs: Date.now() - event.timestamp.getTime(),
					enhancement: {
						durationMs: Date.now() - enhancementStartedAt,
						error,
						outcome: "error",
					},
					error,
					instanceId: event.instanceId,
					liteParse,
					outcome: "error",
					params,
					schedule,
				});

				return { outcome: "error" };
			});

			throw error;
		}

		await step.do("record extraction outcome", async () => {
			recordWorkspaceFileExtractionOutcome({
				durationMs: Date.now() - event.timestamp.getTime(),
				enhancement: {
					durationMs: Date.now() - enhancementStartedAt,
					outcome: "success",
				},
				instanceId: event.instanceId,
				liteParse,
				outcome: "success",
				pageCount: extraction.pageCount,
				params,
				provider: extraction.provider,
				providerMode: extraction.providerMode,
				routeReason: extraction.routeReason,
				schedule,
			});

			return { outcome: "success" };
		});

		return result;
	}
}

interface StagedPageExtractionResult {
	hasExtractableText: boolean;
	manifestObjectKey: string;
	markdownLength: number;
	provider: MarkdownExtractionProviderId;
	providerMode: MarkdownExtractionProviderMode;
	metadata: Record<string, string | number | boolean | null>;
	pageCount: number;
	routeReason: string;
	sourceHash: string;
}

function assertWorkflowParams(
	value: Readonly<WorkspaceFileExtractionWorkflowParams>,
): WorkspaceFileExtractionWorkflowParams {
	if (!value.workspaceId || !value.itemId || !value.assetKind) {
		throw new Error("Invalid workspace file extraction payload.");
	}

	return {
		workspaceId: value.workspaceId,
		itemId: value.itemId,
		actorUserId: value.actorUserId ?? null,
		assetKind: value.assetKind,
		requestId: value.requestId ?? null,
	};
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
