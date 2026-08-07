import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { publishLiteParseProjection } from "#/features/workspaces/extraction/liteparse-projection";
import {
	recordWorkspaceFileExtractionOutcome,
	type WorkspaceFileEnhancementOutcome,
} from "#/features/workspaces/extraction/workspace-file-extraction-observability";
import { createMarkdownExtractionProvider } from "#/features/workspaces/extraction/providers/index";
import {
	getWorkspaceExtractionStepConfig,
	workspaceExtractionStepBudgets,
} from "#/features/workspaces/extraction/workspace-extraction-budgets";
import {
	WorkspaceDocumentUnsupportedError,
	workspaceDocumentUnsupportedErrorName,
	type LiteParseStageOutcome,
	type WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
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

/**
 * Extracts an uploaded file into page markdown in two passes: a fast local one so the
 * document is readable within seconds, then an enhanced provider pass that replaces
 * it. The run settles into exactly one end state — enhanced ready, fast retained, or
 * failed — and records one telemetry event describing both passes.
 */
export class WorkspaceFileExtractionWorkflow extends WorkflowEntrypoint<
	Cloudflare.Env,
	WorkspaceFileExtractionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>,
		step: WorkflowStep,
	) {
		const params = assertWorkflowParams(event.payload);

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

		const enhancement = await this.enhance(step, event, params, liteParse);
		if (enhancement.outcome === "discarded") {
			return { status: "discarded" as const };
		}

		// Nothing readable was published: the fast pass did not produce a projection
		// and the enhanced pass failed, so the item must leave `processing` or readers
		// would wait on an extraction that is no longer running.
		if (enhancement.outcome === "error" && liteParse.outcome !== "success") {
			const failed = await step.do("mark extraction failed", async () => {
				const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
				return kernel.upsertFileProjection({
					itemId: params.itemId,
					format: "pages",
					status: "failed",
					errorMessage: getErrorMessage(enhancement.error),
					actorUserId: params.actorUserId,
					clientMutationId: `${event.instanceId}:projection:failed`,
				});
			});
			if (failed === "discarded") {
				return { status: "discarded" as const };
			}
		}

		await step.do("record extraction outcome", async () => {
			recordWorkspaceFileExtractionOutcome({
				durationMs: Date.now() - event.timestamp.getTime(),
				enhancement,
				instanceId: event.instanceId,
				liteParse,
				params,
				schedule: (task) => this.ctx.waitUntil(task),
			});

			return { recorded: true };
		});

		if (enhancement.outcome === "success") {
			return {
				pageCount: enhancement.pageCount,
				provider: enhancement.provider,
				providerMode: enhancement.providerMode,
				status: "ready" as const,
			};
		}

		if (liteParse.outcome === "success") {
			return {
				pageCount: liteParse.pageCount,
				provider: "liteparse" as const,
				providerMode: "fast" as const,
				status: "ready" as const,
			};
		}

		throw enhancement.error;
	}

	/**
	 * The enhanced pass, returned as a value: failure here is an expected outcome the
	 * run settles on — retained fast projection or a failed item — not an exception
	 * that abandons the workflow.
	 */
	private async enhance(
		step: WorkflowStep,
		event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>,
		params: WorkspaceFileExtractionWorkflowParams,
		liteParse: LiteParseStageOutcome,
	): Promise<WorkspaceFileEnhancementOutcome | { outcome: "discarded" }> {
		const startedAt = Date.now();
		// Captured as soon as the provider returns, because the publish step after it
		// can still fail and the provider has already billed by then.
		let creditsUsed: number | null = null;

		try {
			// A document the free pass has already read and rejected will not become
			// readable by paying for a slower one. Failing without calling the provider
			// matters because the reconciler re-runs failures on a cooldown — letting
			// this through would buy an identical verdict from a paid provider on every
			// sweep.
			if (
				liteParse.outcome === "error" &&
				liteParse.errorType === workspaceDocumentUnsupportedErrorName
			) {
				throw new WorkspaceDocumentUnsupportedError(liteParse.errorMessage);
			}

			const extraction = await step.do(
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

			creditsUsed = getExtractionCreditsUsed(extraction.metadata);

			const published = await step.do(
				"write extracted projections",
				getWorkspaceExtractionStepConfig(workspaceExtractionStepBudgets.publish),
				async () => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);

					return publishWorkspacePageProjection({
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
							metadataJson: {
								...extraction.metadata,
								routeReason: extraction.routeReason,
								pageCount: extraction.pageCount,
								markdownLength: extraction.markdownLength,
							},
							actorUserId: params.actorUserId,
							clientMutationId: `${event.instanceId}:projection:enhanced-ready`,
						},
					});
				},
			);
			if (published === "discarded") {
				return { outcome: "discarded" as const };
			}

			return {
				creditsUsed,
				durationMs: Date.now() - startedAt,
				outcome: "success" as const,
				pageCount: extraction.pageCount,
				provider: extraction.provider,
				providerMode: extraction.providerMode,
				routeReason: extraction.routeReason,
			};
		} catch (error) {
			return {
				creditsUsed,
				durationMs: Date.now() - startedAt,
				error,
				outcome: "error" as const,
			};
		}
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
		healing: value.healing === true,
	};
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function getExtractionCreditsUsed(metadata: StagedPageExtractionResult["metadata"]) {
	// Only LlamaParse reports credits; other providers leave the key absent.
	return typeof metadata.creditsUsed === "number" ? metadata.creditsUsed : null;
}
