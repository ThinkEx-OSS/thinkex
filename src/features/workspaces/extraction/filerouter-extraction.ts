import { FileRouter, type HostedProviderTarget, type ParseResult } from "@file_router/sdk";

import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import type {
	MarkdownExtractionProviderMode,
	StagedPageProjection,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import { writeWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";

const fileRouterPollingIntervalMs = 3_000;
type FileRouterPdfProvider = "liteparse" | "llamaparse";

const pdfTargets: HostedProviderTarget[] = [
	{
		outputs: ["pages"],
		pageFields: ["markdown"],
		provider: "liteparse",
		providerOptions: {
			imageMode: "off",
			includeComplexity: false,
			ocr: "off",
			screenshots: false,
		},
	},
	{
		outputs: ["pages"],
		pageFields: ["markdown"],
		provider: "llamaparse",
		providerOptions: {
			output_options: {
				markdown: {
					tables: {
						output_tables_as_markdown: true,
					},
				},
			},
			processing_options: {
				cost_optimizer: {
					enable: true,
				},
			},
			tier: "agentic" as const,
			version: "latest" as const,
		},
	},
];

export interface FileRouterDocumentReference {
	documentId: string;
	sourceHash: string;
}

export async function uploadWorkspaceFileToFileRouter(
	env: Cloudflare.Env,
	params: WorkspaceFileExtractionWorkflowParams,
	idempotencyKey: string,
): Promise<FileRouterDocumentReference> {
	const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
	const { object, source } = await getWorkspaceFileSourceObject({
		env,
		itemId: params.itemId,
		kernel,
	});
	const document = await createFileRouterClient(env).documents.create(
		{
			data: object.body,
			kind: "stream",
			mimeType: source.contentType,
			name: source.fileName,
		},
		{ idempotencyKey },
	);

	return {
		documentId: document.id,
		sourceHash: object.etag,
	};
}

export async function createFileRouterExtractionJob(
	env: Cloudflare.Env,
	input: {
		documentId: string;
		idempotencyKey: string;
	},
) {
	const job = await createFileRouterClient(env).jobs.create(
		{
			documentId: input.documentId,
			providers: pdfTargets,
		},
		{ idempotencyKey: input.idempotencyKey },
	);

	return { jobId: job.id };
}

export async function stageFileRouterProjection(
	env: Cloudflare.Env,
	input: {
		documentId: string;
		itemId: string;
		jobId: string;
		provider: FileRouterPdfProvider;
		runId: string;
		sourceHash: string;
		tier: "enhanced" | "fast";
		timeoutMs: number;
		workspaceId: string;
	},
): Promise<StagedPageProjection> {
	const client = createFileRouterClient(env);
	const execution = await client.jobs.waitForExecution(input.jobId, input.provider, {
		timeoutMs: input.timeoutMs,
	});

	if (execution.status !== "complete") {
		throw new Error(
			execution.error?.message ??
				`FileRouter ${input.provider} execution failed without an error message.`,
		);
	}

	const result = await client.executions.result(execution.id);
	const providerMode = getProviderMode(input.provider);
	const metadata = getFileRouterResultMetadata(result, {
		documentId: input.documentId,
		executionId: execution.id,
		jobId: input.jobId,
	});
	const projection = await writeWorkspacePageProjection({
		bucket: env.WORKSPACE_KERNEL_FILES,
		itemId: input.itemId,
		metadata,
		pages: getProjectionPages(result),
		provider: input.provider,
		providerMode,
		runId: input.runId,
		sourceHash: input.sourceHash,
		tier: input.tier,
		workspaceId: input.workspaceId,
	});

	return {
		manifestObjectKey: projection.manifestObjectKey,
		markdownLength: projection.manifest.markdownLength,
		metadata,
		pageCount: projection.manifest.pageCount,
		provider: input.provider,
		providerMode,
		routeReason: `filerouter_${input.provider}`,
		sourceHash: input.sourceHash,
	};
}

export function deleteFileRouterDocument(env: Cloudflare.Env, documentId: string) {
	return createFileRouterClient(env).documents.delete(documentId);
}

function createFileRouterClient(env: Cloudflare.Env) {
	return new FileRouter({
		apiKey: env.FILEROUTER_API_KEY,
		pollingIntervalMs: fileRouterPollingIntervalMs,
	});
}

function getProjectionPages(result: ParseResult): MarkdownProjectionPage[] {
	const pages = result.outputs.pages;
	if (!pages) {
		throw new Error(`FileRouter ${result.provider} result did not include pages.`);
	}

	return pages.map((page) => ({
		markdown: page.markdown ?? "",
		pageNumber: page.pageNumber,
	}));
}

function getProviderMode(provider: FileRouterPdfProvider): MarkdownExtractionProviderMode {
	switch (provider) {
		case "liteparse":
			return "fast";
		case "llamaparse":
			return "agentic";
	}
}

function getFileRouterResultMetadata(
	result: ParseResult,
	resources: {
		documentId: string;
		executionId: string;
		jobId: string;
	},
) {
	return {
		credits: result.usage?.credits ?? null,
		documentId: resources.documentId,
		durationMs: result.timing.durationMs,
		executionId: resources.executionId,
		jobId: resources.jobId,
		pageCount: result.pageCount,
		resultId: result.id,
		warningCount: result.warnings.length,
	};
}
