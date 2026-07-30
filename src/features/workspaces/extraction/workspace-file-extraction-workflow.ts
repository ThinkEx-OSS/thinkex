import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

import { publishLiteParseProjection } from "#/features/workspaces/extraction/liteparse-projection";
import { recordWorkspaceFileExtractionOutcome } from "#/features/workspaces/extraction/workspace-file-extraction-observability";
import { createMarkdownExtractionProvider } from "#/features/workspaces/extraction/providers/index";
import type {
	LiteParseStageOutcome,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import type {
	WorkspaceFileExtractionMode,
	WorkspaceFileExtractionProviderId,
} from "#/features/workspaces/model/workspace-file/types";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { writeWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import {
	getWorkspaceKernelFromEnv,
	type WorkspaceKernelClient,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import { isWorkspaceKernelItemNotFoundError } from "#/features/workspaces/kernel/workspace-kernel-item-errors";
import type { UpsertWorkspaceKernelFileProjectionArgs } from "#/features/workspaces/kernel/workspace-kernel-types";
import { getWorkspaceUploadFamily } from "#/features/workspaces/model/workspace-file";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

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

		try {
			await step.do("mark extraction processing", async () => {
				const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
				await upsertFileProjectionTerminal(kernel, {
					itemId: params.itemId,
					format: "pages",
					status: "processing",
					actorUserId: params.actorUserId,
					clientMutationId: `${event.instanceId}:projection:processing`,
				});

				return { status: "processing" };
			});
		} catch (error) {
			// The file was deleted before extraction began. Abandon cleanly rather
			// than retrying provider work on an item that no longer exists.
			if (isWorkspaceKernelItemNotFoundError(error)) {
				await this.recordAbandonedExtraction(step, {
					event,
					params,
					schedule,
					liteParse: { durationMs: 0, outcome: "skipped" },
					enhancement: { durationMs: 0, error, outcome: "error" },
				});

				return { status: "abandoned" as const };
			}

			throw error;
		}

		const liteParse = await publishLiteParseProjection(this.env, step, params, event.instanceId);
		const enhancementStartedAt = Date.now();
		let extraction: StagedPageExtractionResult;
		let result: {
			pageCount: number;
			provider: WorkspaceFileExtractionProviderId;
			providerMode: WorkspaceFileExtractionMode;
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
					const { object, source } = await readFileSourceTerminal({
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
					};

					await upsertFileProjectionTerminal(kernel, {
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
			// The file was deleted mid-extraction. Treat it as terminal: record an
			// abandoned outcome and stop, instead of exhausting retries and filing an
			// error-tracking issue for an item the user intentionally removed.
			if (isWorkspaceKernelItemNotFoundError(error)) {
				await this.recordAbandonedExtraction(step, {
					event,
					params,
					schedule,
					liteParse,
					enhancement: {
						durationMs: Date.now() - enhancementStartedAt,
						error,
						outcome: "error",
					},
				});

				return { status: "abandoned" as const };
			}

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

			try {
				await step.do("mark extraction failed", async () => {
					const kernel = await getWorkspaceKernelFromEnv(this.env, params.workspaceId);
					const errorMessage = getErrorMessage(error);
					await upsertFileProjectionTerminal(kernel, {
						itemId: params.itemId,
						format: "pages",
						status: "failed",
						errorMessage,
						actorUserId: params.actorUserId,
						clientMutationId: `${event.instanceId}:projection:failed`,
					});

					return { status: "failed", errorMessage };
				});
			} catch (failureError) {
				// The item was deleted while we were recording the failure. Abandon
				// rather than surfacing the original error as an unhandled exception.
				if (isWorkspaceKernelItemNotFoundError(failureError)) {
					await this.recordAbandonedExtraction(step, {
						event,
						params,
						schedule,
						liteParse,
						enhancement: {
							durationMs: Date.now() - enhancementStartedAt,
							error,
							outcome: "error",
						},
					});

					return { status: "abandoned" as const };
				}

				throw failureError;
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

	private async recordAbandonedExtraction(
		step: WorkflowStep,
		input: {
			event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>;
			params: WorkspaceFileExtractionWorkflowParams;
			schedule: PostHogTelemetryScheduler;
			liteParse: LiteParseStageOutcome;
			enhancement: { durationMs: number; error: unknown; outcome: "error" };
		},
	) {
		await step.do("record abandoned extraction outcome", async () => {
			recordWorkspaceFileExtractionOutcome({
				durationMs: Date.now() - input.event.timestamp.getTime(),
				enhancement: input.enhancement,
				instanceId: input.event.instanceId,
				liteParse: input.liteParse,
				outcome: "abandoned",
				params: input.params,
				schedule: input.schedule,
			});

			return { outcome: "abandoned" as const };
		});
	}
}

/**
 * Publishes a file projection, converting a missing/deleted item into a
 * {@link NonRetryableError} so the workflow step stops retrying immediately
 * instead of burning its retry budget on an item that no longer exists.
 */
async function upsertFileProjectionTerminal(
	kernel: WorkspaceKernelClient,
	input: UpsertWorkspaceKernelFileProjectionArgs,
) {
	try {
		await kernel.upsertFileProjection(input);
	} catch (error) {
		throw toTerminalMissingItemError(error);
	}
}

/** Reads a file source, applying the same terminal handling for deleted items. */
async function readFileSourceTerminal(input: {
	env: Cloudflare.Env;
	itemId: string;
	kernel: WorkspaceKernelClient;
}) {
	try {
		return await getWorkspaceFileSourceObject(input);
	} catch (error) {
		throw toTerminalMissingItemError(error);
	}
}

function toTerminalMissingItemError(error: unknown): unknown {
	if (!isWorkspaceKernelItemNotFoundError(error)) {
		return error;
	}

	const message = error instanceof Error ? error.message : "Workspace item not found.";
	// Preserve the name so the error stays recognizable after the workflow rethrows it.
	return new NonRetryableError(message, "WorkspaceKernelItemNotFoundError");
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
