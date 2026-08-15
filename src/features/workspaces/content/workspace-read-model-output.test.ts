import { describe, expect, it } from "vitest";

import type { WorkspaceReadItemsOutput } from "#/features/workspaces/content/workspace-content-contract";
import { createWorkspaceReadItemsModelOutput } from "#/features/workspaces/content/workspace-read-model-output";

describe("workspace read model output", () => {
	it("drops internal item ids and keeps self-describing refs", () => {
		const output: WorkspaceReadItemsOutput = {
			results: [
				{
					content: '<h1 data-ref="b_abcdefghijkl.r_012345">Notes</h1>',
					format: "html",
					itemId: "document-1",
					location: { endBlock: 1, kind: "blocks", startBlock: 1, totalBlocks: 1 },
					path: "/Notes",
					ref: "Xk7p2Qa9",
					status: "ready",
					type: "document",
				},
			],
		};

		const modelOutput = createWorkspaceReadItemsModelOutput(output);
		expect(modelOutput).not.toHaveProperty("guidance");
		expect(modelOutput.results[0]).toMatchObject({
			content: expect.stringContaining('data-ref="b_abcdefghijkl.r_012345"'),
			path: "/Notes",
			ref: "Xk7p2Qa9",
			status: "ready",
		});
		expect(JSON.stringify(modelOutput)).not.toContain("document-1");
	});

	it("emits each handling guidance once per situation", () => {
		const output: WorkspaceReadItemsOutput = {
			results: [
				{
					elapsedSeconds: 5,
					path: "/A.pdf",
					phase: "extracting",
					retryAfterSeconds: 10,
					status: "pending",
					type: "file",
				},
				{
					elapsedSeconds: 9,
					path: "/B.pdf",
					phase: "queued",
					retryAfterSeconds: 10,
					status: "pending",
					type: "file",
				},
				{ code: "extraction_failed", path: "/C.pdf", status: "failed", type: "file" },
			],
		};

		const modelOutput = createWorkspaceReadItemsModelOutput(output);
		expect(modelOutput.guidance).toHaveLength(2);
		expect(modelOutput.guidance?.[0]).toContain("still extracting");
		expect(modelOutput.guidance?.[1]).toContain("will not finish");
	});

	it("does not warn about empty pages once extraction is final", () => {
		const output: WorkspaceReadItemsOutput = {
			results: [
				{
					assetKind: "pdf",
					content: "## Page 1",
					emptyPages: [1],
					format: "markdown",
					itemId: "file-1",
					location: { kind: "pages", requested: "1", returned: [1], total: 1 },
					path: "/Book.pdf",
					ref: "Yk7p2Qa9",
					status: "ready",
					type: "file",
				},
			],
		};

		expect(createWorkspaceReadItemsModelOutput(output)).not.toHaveProperty("guidance");
	});
});
