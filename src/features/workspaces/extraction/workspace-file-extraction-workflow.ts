import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { publishLiteParseProjection } from "#/features/workspaces/extraction/liteparse-projection";
import { recordWorkspaceFileExtractionOutcome } from "#/features/workspaces/extraction/workspace-file-extraction-observability";
import { createMarkdownExtractionProvider } from "#/features/workspaces/extraction/providers/index";
import {
	getWorkspaceExtractionStepConfig,
	workspaceExtractionStepBudgets,
} from "#/features/workspaces/extraction/workspace-extraction-budgets";
import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import type {
	WorkspaceFileExtractionMode,
	WorkspaceFileExtractionProviderId,
} from "#/features/workspaces/model/workspace-file/types";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import {
	publishWorkspacePageProjection,
	writeWorkspacePageProjection,
} from "#/features/workspaces/extraction/workspace-page-projection";
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

		const processing = await step.do("mark extraction processing", async () => {
			const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
			return kernel.upsertFileProjection({
				itemId: params.itemId,
				format: "pages",
				status: "processing",
				actorUserId: params.actorUserId,
				clientMutationId: `${event.instanceId}:projection:processing`,
			});
		});
		if (processing === "discarded") {
			return { status: "discarded" as const };
		}

		const liteParse = await publishLiteParseProjection(this.env, step, params, event.instanceId);
		if (liteParse.outcome === "discarded") {
			return { status: "discarded" as const };
		}
		const enhancementStartedAt = Date.now();
		let extraction: StagedPageExtractionResult;
		// Captured as soon as extraction returns, because the steps after it can still
		// fail. LlamaParse has already billed by then, and reporting null there would
		// quietly understate spend on exactly the runs worth investigating.
		let extractionCreditsUsed: number | null = null;
		let result:
			| {
					pageCount: number;
					provider: WorkspaceFileExtractionProviderId;
					providerMode: WorkspaceFileExtractionMode;
					status: "ready";
			  }
			| { status: "discarded" };

		try {
			extraction = await step.do(
				"extract page markdown with provider",
				getWorkspaceExtractionStepConfig(workspaceExtractionStepBudgets.extract),
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

			extractionCreditsUsed = getExtractionCreditsUsed(extraction.metadata);

			result = await step.do(
				"write extracted projections",
				getWorkspaceExtractionStepConfig(workspaceExtractionStepBudgets.publish),
				async () => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
					const metadataJson = {
						...extraction.metadata,
						routeReason: extraction.routeReason,
						pageCount: extraction.pageCount,
						markdownLength: extraction.markdownLength,
					};

					const status = await publishWorkspacePageProjection({
						bucket: this.env.WORKSPACE_KERNEL_FILES,
						kernel,
						projection: {
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
						},
					});
					if (status === "discarded") {
						return { status: "discarded" as const };
					}

					return {
						status: "ready" as const,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						pageCount: extraction.pageCount,
					};
				},
			);
			if (result.status === "discarded") {
				return result;
			}
		} catch (error) {
			if (liteParse.outcome === "success") {
				await step.do("record partial extraction outcome", async () => {
					recordWorkspaceFileExtractionOutcome({
						// Null only when extraction itself never completed; a failure in the
						// steps after it still owes whatever LlamaParse already charged.
						creditsUsed: extractionCreditsUsed,
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

			const failed = await step.do("mark extraction failed", async () => {
				const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
				return kernel.upsertFileProjection({
					itemId: params.itemId,
					format: "pages",
					status: "failed",
					errorMessage: getErrorMessage(error),
					actorUserId: params.actorUserId,
					clientMutationId: `${event.instanceId}:projection:failed`,
				});
			});
			if (failed === "discarded") {
				return { status: "discarded" as const };
			}

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
				creditsUsed: getExtractionCreditsUsed(extraction.metadata),
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
	manifestObjectKey: string;
	markdownLength: number;
	provider: WorkspaceFileExtractionProviderId;
	providerMode: WorkspaceFileExtractionMode;
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

function getExtractionCreditsUsed(metadata: StagedPageExtractionResult["metadata"]) {
	// Only LlamaParse reports credits; other providers leave the key absent.
	return typeof metadata.creditsUsed === "number" ? metadata.creditsUsed : null;
}
