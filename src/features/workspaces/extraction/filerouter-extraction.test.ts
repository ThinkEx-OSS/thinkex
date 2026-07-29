import type { HostedJobAccepted } from "@file_router/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fileRouter = vi.hoisted(() => ({
	createDocument: vi.fn(),
	createJob: vi.fn(),
	getResult: vi.fn(),
	options: vi.fn(),
	releaseDocument: vi.fn(),
	waitForExecution: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
	getKernel: vi.fn(),
	getSource: vi.fn(),
	writeProjection: vi.fn(),
}));

vi.mock("@file_router/sdk", () => ({
	FileRouter: class {
		readonly documents = {
			create: fileRouter.createDocument,
			release: fileRouter.releaseDocument,
		};
		readonly executions = { result: fileRouter.getResult };
		readonly jobs = {
			create: fileRouter.createJob,
			waitForExecution: fileRouter.waitForExecution,
		};

		constructor(options: unknown) {
			fileRouter.options(options);
		}
	},
}));
vi.mock("#/features/workspaces/extraction/workspace-file-source", () => ({
	getWorkspaceFileSourceObject: workspace.getSource,
}));
vi.mock("#/features/workspaces/extraction/workspace-page-projection", () => ({
	writeWorkspacePageProjection: workspace.writeProjection,
}));
vi.mock("#/features/workspaces/kernel/workspace-kernel-access", () => ({
	getWorkspaceKernelFromEnv: workspace.getKernel,
}));

import {
	createFileRouterExtractionJob,
	releaseFileRouterDocument,
	stageFileRouterProjection,
	uploadWorkspaceFileToFileRouter,
} from "#/features/workspaces/extraction/filerouter-extraction";

const acceptedJob: HostedJobAccepted = {
	executions: [
		{ id: "execution_fast", key: "fast", provider: "liteparse" },
		{ id: "execution_enhanced", key: "enhanced", provider: "llamaparse" },
	],
	id: "job_123",
	status: "queued" as const,
};

beforeEach(() => {
	for (const mock of Object.values(fileRouter)) {
		mock.mockReset();
	}
	for (const mock of Object.values(workspace)) {
		mock.mockReset();
	}
	fileRouter.createJob.mockResolvedValue(acceptedJob);
});

describe("FileRouter extraction", () => {
	it("starts one keyed LiteParse and LlamaParse job", async () => {
		const result = await createFileRouterExtractionJob(
			{ FILEROUTER_API_KEY: "fr_test" } as Cloudflare.Env,
			{
				documentId: "document_123",
				idempotencyKey: "workflow_123:job",
			},
		);

		expect(result).toEqual(acceptedJob);
		expect(fileRouter.options).toHaveBeenCalledWith({
			apiKey: "fr_test",
		});
		expect(fileRouter.createJob).toHaveBeenCalledWith(
			{
				documentId: "document_123",
				providers: [
					{
						key: "fast",
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
						key: "enhanced",
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
							tier: "agentic",
							version: "latest",
						},
					},
				],
			},
			{ idempotencyKey: "workflow_123:job" },
		);
	});

	it("streams the stored workspace source into FileRouter", async () => {
		const body = new ReadableStream<Uint8Array>();
		workspace.getKernel.mockResolvedValue({ id: "kernel" });
		workspace.getSource.mockResolvedValue({
			object: { body, etag: "source-etag" },
			source: { contentType: "application/pdf", fileName: "source.pdf" },
		});
		fileRouter.createDocument.mockResolvedValue({ id: "document_123" });

		const result = await uploadWorkspaceFileToFileRouter(
			{ FILEROUTER_API_KEY: "fr_test" } as Cloudflare.Env,
			{
				actorUserId: "user_123",
				assetKind: "pdf",
				itemId: "item_123",
				requestId: "request_123",
				workspaceId: "workspace_123",
			},
			"workflow_123:document",
		);

		expect(result).toEqual({
			documentId: "document_123",
			sourceHash: "source-etag",
		});
		expect(fileRouter.createDocument).toHaveBeenCalledWith(
			{
				data: body,
				kind: "stream",
				mimeType: "application/pdf",
				name: "source.pdf",
			},
			{ idempotencyKey: "workflow_123:document" },
		);
	});

	it("waits on the exact keyed execution and stages normalized pages", async () => {
		fileRouter.waitForExecution.mockResolvedValue({
			id: "execution_fast",
			resultAvailable: true,
			status: "complete",
		});
		fileRouter.getResult.mockResolvedValue({
			id: "result_123",
			outputs: {
				pages: [
					{ markdown: "# First", pageNumber: 1 },
					{ markdown: "# Second", pageNumber: 2 },
				],
			},
			pageCount: 2,
			provider: "liteparse",
			timing: { durationMs: 42 },
			usage: { credits: 1 },
			warnings: [],
		});
		workspace.writeProjection.mockResolvedValue({
			manifest: { markdownLength: 16, pageCount: 2 },
			manifestObjectKey: "projection/manifest.json",
		});

		const result = await stageFileRouterProjection(
			{
				FILEROUTER_API_KEY: "fr_test",
				WORKSPACE_KERNEL_FILES: {} as R2Bucket,
			} as Cloudflare.Env,
			{
				documentId: "document_123",
				executionKey: "fast",
				itemId: "item_123",
				job: acceptedJob,
				runId: "run_123",
				sourceHash: "source-etag",
				tier: "fast",
				timeoutMs: 300_000,
				workspaceId: "workspace_123",
			},
		);

		expect(fileRouter.waitForExecution).toHaveBeenCalledWith(
			acceptedJob,
			acceptedJob.executions[0],
			{ timeoutMs: 300_000 },
		);
		expect(fileRouter.getResult).toHaveBeenCalledWith("execution_fast");
		expect(workspace.writeProjection).toHaveBeenCalledWith(
			expect.objectContaining({
				pages: [
					{ markdown: "# First", pageNumber: 1 },
					{ markdown: "# Second", pageNumber: 2 },
				],
				provider: "liteparse",
				providerMode: "fast",
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				manifestObjectKey: "projection/manifest.json",
				pageCount: 2,
				provider: "liteparse",
				providerMode: "fast",
				routeReason: "filerouter_liteparse",
			}),
		);
	});

	it("does not request an unavailable execution result", async () => {
		fileRouter.waitForExecution.mockResolvedValue({
			id: "execution_enhanced",
			resultAvailable: false,
			status: "complete",
		});

		await expect(
			stageFileRouterProjection({ FILEROUTER_API_KEY: "fr_test" } as Cloudflare.Env, {
				documentId: "document_123",
				executionKey: "enhanced",
				itemId: "item_123",
				job: acceptedJob,
				runId: "run_123",
				sourceHash: "source-etag",
				tier: "enhanced",
				timeoutMs: 600_000,
				workspaceId: "workspace_123",
			}),
		).rejects.toThrow("completed without an available result");
		expect(fileRouter.getResult).not.toHaveBeenCalled();
		expect(workspace.writeProjection).not.toHaveBeenCalled();
	});

	it("releases document artifacts after extraction", async () => {
		await releaseFileRouterDocument(
			{ FILEROUTER_API_KEY: "fr_test" } as Cloudflare.Env,
			"document_123",
		);

		expect(fileRouter.releaseDocument).toHaveBeenCalledWith("document_123");
	});
});
