import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import type { HostedJobAccepted } from "@file_router/sdk";

import {
	createFileRouterExtractionJob,
	type FileRouterDocumentReference,
	releaseFileRouterDocument,
	stageFileRouterProjection,
	uploadWorkspaceFileToFileRouter,
} from "#/features/workspaces/extraction/filerouter-extraction";
import type {
	LiteParseStageOutcome,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { recordWorkspaceFileExtractionOutcomeStep } from "#/features/workspaces/extraction/workspace-file-extraction-observability";
import {
	markWorkspaceFileExtractionFailed,
	publishWorkspaceFileProjection,
} from "#/features/workspaces/extraction/workspace-file-extraction-state";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

const fastExtractionTimeoutMs = 5 * 60_000;
const enhancedExtractionTimeoutMs = 10 * 60_000;

interface PdfExtractionInput {
	env: Cloudflare.Env;
	event: Readonly<WorkflowEvent<WorkspaceFileExtractionWorkflowParams>>;
	params: WorkspaceFileExtractionWorkflowParams;
	schedule: PostHogTelemetryScheduler;
	step: WorkflowStep;
}

export async function runWorkspacePdfExtraction(input: PdfExtractionInput) {
	const document = await uploadSourceDocument(input);
	const result = await extractPdf(input, document);
	await releaseSourceDocument(input, document.documentId);
	return result;
}

async function extractPdf(input: PdfExtractionInput, document: FileRouterDocumentReference) {
	let failureStartedAt = Date.now();
	let liteParse: LiteParseStageOutcome = { durationMs: 0, outcome: "skipped" };

	try {
		const job = await input.step.do(
			"start FileRouter extraction",
			{
				retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
				timeout: "2 minutes",
			},
			() =>
				createFileRouterExtractionJob(input.env, {
					documentId: document.documentId,
					idempotencyKey: `${input.event.instanceId}:job`,
				}),
		);
		liteParse = await publishFastProjection(input, document, job);
		failureStartedAt = Date.now();
		const extraction = await input.step.do(
			"stage enhanced FileRouter projection",
			{
				retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
				timeout: "12 minutes",
			},
			() =>
				stageFileRouterProjection(input.env, {
					documentId: document.documentId,
					executionKey: "enhanced",
					itemId: input.params.itemId,
					job,
					runId: input.event.instanceId,
					sourceHash: document.sourceHash,
					tier: "enhanced",
					timeoutMs: enhancedExtractionTimeoutMs,
					workspaceId: input.params.workspaceId,
				}),
		);
		const result = await publishWorkspaceFileProjection(
			input.env,
			input.step,
			input.params,
			input.event.instanceId,
			extraction,
			false,
		);

		await recordWorkspaceFileExtractionOutcomeStep(input.step, "record extraction outcome", {
			durationMs: Date.now() - input.event.timestamp.getTime(),
			enhancement: {
				durationMs: Date.now() - failureStartedAt,
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

		return result;
	} catch (error) {
		return handlePdfExtractionFailure(input, liteParse, failureStartedAt, error);
	}
}

async function publishFastProjection(
	input: PdfExtractionInput,
	document: FileRouterDocumentReference,
	job: HostedJobAccepted,
): Promise<LiteParseStageOutcome> {
	const startedAt = Date.now();
	try {
		const extraction = await input.step.do(
			"stage fast FileRouter projection",
			{
				retries: { limit: 1, delay: "10 seconds", backoff: "constant" },
				timeout: "7 minutes",
			},
			() =>
				stageFileRouterProjection(input.env, {
					documentId: document.documentId,
					executionKey: "fast",
					itemId: input.params.itemId,
					job,
					runId: input.event.instanceId,
					sourceHash: document.sourceHash,
					tier: "fast",
					timeoutMs: fastExtractionTimeoutMs,
					workspaceId: input.params.workspaceId,
				}),
		);
		await publishWorkspaceFileProjection(
			input.env,
			input.step,
			input.params,
			input.event.instanceId,
			extraction,
			true,
		);

		return {
			durationMs: Date.now() - startedAt,
			markdownLength: extraction.markdownLength,
			outcome: "success",
			pageCount: extraction.pageCount,
		};
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.params.actorUserId ?? undefined,
			error,
			event: "workspace_liteparse_projection",
			fields: {
				item_id: input.params.itemId,
				request_id: input.params.requestId,
				workflow_id: input.event.instanceId,
				workspace_id: input.params.workspaceId,
			},
			schedule: input.schedule,
		});

		return {
			durationMs: Date.now() - startedAt,
			errorType: error instanceof Error ? error.name : "UnknownError",
			outcome: "error",
		};
	}
}

async function handlePdfExtractionFailure(
	input: PdfExtractionInput,
	liteParse: LiteParseStageOutcome,
	failureStartedAt: number,
	error: unknown,
) {
	if (liteParse.outcome === "success") {
		await recordWorkspaceFileExtractionOutcomeStep(
			input.step,
			"record partial extraction outcome",
			{
				durationMs: Date.now() - input.event.timestamp.getTime(),
				enhancement: {
					durationMs: Date.now() - failureStartedAt,
					error,
					outcome: "error",
				},
				instanceId: input.event.instanceId,
				liteParse,
				outcome: "partial",
				pageCount: liteParse.pageCount,
				params: input.params,
				provider: "liteparse",
				providerMode: "fast",
				routeReason: "filerouter_liteparse_fallback",
				schedule: input.schedule,
			},
		);

		return {
			pageCount: liteParse.pageCount,
			provider: "liteparse" as const,
			providerMode: "fast" as const,
			status: "ready" as const,
		};
	}

	return failPdfExtraction(input, liteParse, failureStartedAt, error);
}

async function uploadSourceDocument(
	input: PdfExtractionInput,
): Promise<FileRouterDocumentReference> {
	const startedAt = Date.now();

	try {
		return await input.step.do(
			"upload source to FileRouter",
			{
				retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
				timeout: "5 minutes",
			},
			() =>
				uploadWorkspaceFileToFileRouter(
					input.env,
					input.params,
					`${input.event.instanceId}:document`,
				),
		);
	} catch (error) {
		return failPdfExtraction(input, { durationMs: 0, outcome: "skipped" }, startedAt, error);
	}
}

async function failPdfExtraction(
	input: PdfExtractionInput,
	liteParse: LiteParseStageOutcome,
	failureStartedAt: number,
	error: unknown,
): Promise<never> {
	await markWorkspaceFileExtractionFailed(
		input.env,
		input.step,
		input.params,
		input.event.instanceId,
		error,
	);
	await recordWorkspaceFileExtractionOutcomeStep(input.step, "record extraction failure", {
		durationMs: Date.now() - input.event.timestamp.getTime(),
		enhancement: {
			durationMs: Date.now() - failureStartedAt,
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

	throw error;
}

async function releaseSourceDocument(input: PdfExtractionInput, documentId: string) {
	try {
		await input.step.do(
			"release FileRouter document artifacts",
			{
				retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
				timeout: "2 minutes",
			},
			() => releaseFileRouterDocument(input.env, documentId),
		);
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.params.actorUserId ?? undefined,
			error,
			event: "workspace_file_extraction_cleanup",
			fields: {
				document_id: documentId,
				item_id: input.params.itemId,
				request_id: input.params.requestId,
				workflow_id: input.event.instanceId,
				workspace_id: input.params.workspaceId,
			},
			schedule: input.schedule,
		});
	}
}
