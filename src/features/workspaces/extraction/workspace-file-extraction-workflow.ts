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
import { publishWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { updateWorkspaceFileExtraction } from "#/features/workspaces/persistence/workspace-files";
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
			return updateWorkspaceFileExtraction({
				itemId: params.itemId,
				workspaceId: params.workspaceId,
				status: "processing",
				actorUserId: params.actorUserId,
			});
		});
		if (processing === "discarded") {
			return { status: "discarded" as const };
		}

		const liteParse = await publishLiteParseProjection(this.env, step, params, event.instanceId);
		if (liteParse.outcome === "discarded") {
			return { status: "discarded" as const };
		}

		const enhancement = await this.enhance(step, params, liteParse);
		if (enhancement.outcome === "discarded") {
			return { status: "discarded" as const };
		}

		// Nothing readable was published: the fast pass did not produce a projection
		// and the enhanced pass failed, so the item must leave `processing` or readers
		// would wait on an extraction that is no longer running.
		if (enhancement.outcome === "error" && liteParse.outcome !== "success") {
			const failed = await step.do("mark extraction failed", async () => {
				return updateWorkspaceFileExtraction({
					itemId: params.itemId,
					workspaceId: params.workspaceId,
					status: "failed",
					errorMessage: getErrorMessage(enhancement.error),
					actorUserId: params.actorUserId,
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
		params: WorkspaceFileExtractionWorkflowParams,
		liteParse: LiteParseStageOutcome,
	): Promise<WorkspaceFileEnhancementOutcome | { outcome: "discarded" }> {
		const startedAt = Date.now();
		// Captured as soon as the provider returns, because the publish step after it
		// can still fail and the provider has already billed by then.
		let creditsUsed: number | null = null;

		try {
			// A document the free pass has already read and rejected will not become
			// readable by paying for a slower one.
			if (
				liteParse.outcome === "error" &&
				liteParse.errorType === workspaceDocumentUnsupportedErrorName
			) {
				throw new WorkspaceDocumentUnsupportedError(liteParse.errorMessage);
			}

			const extraction = await step.do(
				"extract page markdown with provider",
				getWorkspaceExtractionStepConfig(workspaceExtractionStepBudgets.extract),
				async (): Promise<PublishedPageExtractionResult> => {
					const { object, source } = await getWorkspaceFileSourceObject({
						env: this.env,
						itemId: params.itemId,
						workspaceId: params.workspaceId,
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
					creditsUsed = getExtractionCreditsUsed(extraction.metadata);

					const projection = await publishWorkspacePageProjection({
						itemId: params.itemId,
						workspaceId: params.workspaceId,
						pages: extraction.pages,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						sourceHash: object.etag,
						tier: "enhanced",
						metadata: {
							...extraction.metadata,
							routeReason: route.reason,
						},
						actorUserId: params.actorUserId,
					});

					return {
						status: projection.status,
						provider: extraction.provider,
						providerMode: extraction.providerMode,
						metadata: extraction.metadata,
						pageCount: projection.pageCount,
						routeReason: route.reason,
					};
				},
			);

			if (extraction.status === "discarded") {
				return { outcome: "discarded" as const };
			}

			return {
				creditsUsed,
				durationMs: Date.now() - startedAt,
				outcome: "success" as const,
				pageCount: extraction.pageCount,
				queuedMs: getMetadataNumber(extraction.metadata, "queuedMs"),
				parseMs: getMetadataNumber(extraction.metadata, "parseMs"),
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

interface PublishedPageExtractionResult {
	status: "applied" | "discarded";
	provider: WorkspaceFileExtractionProviderId;
	providerMode: WorkspaceFileExtractionMode;
	metadata: Record<string, string | number | boolean | null>;
	pageCount: number;
	routeReason: string;
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

function getExtractionCreditsUsed(metadata: PublishedPageExtractionResult["metadata"]) {
	// Enhanced providers report credits; local providers leave the key absent.
	return getMetadataNumber(metadata, "creditsUsed");
}

function getMetadataNumber(metadata: PublishedPageExtractionResult["metadata"], key: string) {
	const value = metadata[key];
	return typeof value === "number" ? value : null;
}
