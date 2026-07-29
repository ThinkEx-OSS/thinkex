import { beforeEach, describe, expect, it, vi } from "vitest";

const fileRouter = vi.hoisted(() => ({
	createJob: vi.fn(),
	options: vi.fn(),
}));

vi.mock("@file_router/sdk", () => ({
	FileRouter: class {
		readonly jobs = { create: fileRouter.createJob };

		constructor(options: unknown) {
			fileRouter.options(options);
		}
	},
}));
vi.mock("#/features/workspaces/extraction/workspace-file-source", () => ({
	getWorkspaceFileSourceObject: vi.fn(),
}));
vi.mock("#/features/workspaces/extraction/workspace-page-projection", () => ({
	writeWorkspacePageProjection: vi.fn(),
}));
vi.mock("#/features/workspaces/kernel/workspace-kernel-access", () => ({
	getWorkspaceKernelFromEnv: vi.fn(),
}));

import { createFileRouterExtractionJob } from "#/features/workspaces/extraction/filerouter-extraction";

beforeEach(() => {
	fileRouter.createJob.mockReset();
	fileRouter.options.mockReset();
	fileRouter.createJob.mockResolvedValue({ id: "job_123", status: "queued" });
});

describe("FileRouter extraction", () => {
	it("starts one selective LiteParse and LlamaParse job", async () => {
		const result = await createFileRouterExtractionJob(
			{ FILEROUTER_API_KEY: "fr_test" } as Cloudflare.Env,
			{
				documentId: "document_123",
				idempotencyKey: "workflow_123:job",
			},
		);

		expect(result).toEqual({ jobId: "job_123" });
		expect(fileRouter.options).toHaveBeenCalledWith({
			apiKey: "fr_test",
		});
		expect(fileRouter.createJob).toHaveBeenCalledWith(
			{
				documentId: "document_123",
				providers: [
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
							tier: "agentic",
							version: "latest",
						},
					},
				],
			},
			{ idempotencyKey: "workflow_123:job" },
		);
	});
});
