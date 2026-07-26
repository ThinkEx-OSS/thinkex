import { describe, expect, it } from "vitest";

import type {
	WorkspaceContentReadResult,
	WorkspaceReadItemsOutput,
} from "#/features/workspaces/content/workspace-content-contract";
import {
	createWorkspaceReadItemsModelOutput,
	createWorkspaceReadReferences,
} from "#/features/workspaces/content/workspace-read-references";

describe("workspace read references", () => {
	it("gives documents one item ref and extracted files one ref per physical page", () => {
		const results = [documentResult(), fileResult()] satisfies WorkspaceContentReadResult[];
		const references = createWorkspaceReadReferences(results);

		expect(references).toHaveLength(3);
		expect(references.map(({ location }) => location)).toEqual([
			{ itemId: "document-1", kind: "item", version: 1 },
			{ itemId: "file-1", kind: "pdf-page", pageNumber: 12, version: 1 },
			{ itemId: "file-1", kind: "pdf-page", pageNumber: 13, version: 1 },
		]);
		expect(references.every(({ ref }) => /^wr_[0-9A-Za-z]{8}$/.test(ref))).toBe(true);
	});

	it("projects refs beside content without exposing durable item IDs", () => {
		const results = [documentResult(), fileResult()] satisfies WorkspaceContentReadResult[];
		const output: WorkspaceReadItemsOutput = {
			references: createWorkspaceReadReferences(results),
			results,
		};
		const modelOutput = createWorkspaceReadItemsModelOutput(output);
		const document = modelOutput.results[0];
		const file = modelOutput.results[1];

		expect(document).toMatchObject({
			path: "/Notes",
			reference: expect.stringMatching(/^wr_[0-9A-Za-z]{8}$/),
			status: "ready",
			type: "document",
		});
		expect(file).toMatchObject({
			status: "ready",
			type: "file",
		});
		expect(file).not.toHaveProperty("pageReferences");
		expect(file && "content" in file ? file.content : "").toMatch(
			/^## Page 12 \[ref: wr_[0-9A-Za-z]{8}\]$/m,
		);
		expect(file && "content" in file ? file.content : "").toMatch(
			/^## Page 13 \[ref: wr_[0-9A-Za-z]{8}\]$/m,
		);
		expect(JSON.stringify(modelOutput)).not.toContain("document-1");
		expect(JSON.stringify(modelOutput)).not.toContain("file-1");
	});

	it("deduplicates repeated reads of the same durable location in one result", () => {
		const references = createWorkspaceReadReferences([
			documentResult(),
			{ ...documentResult(), content: "continued" },
		]);

		expect(references).toHaveLength(1);
	});

	it("uses an item ref for extracted images that have no page-navigation surface", () => {
		const image = {
			...fileResult(),
			assetKind: "image",
			itemId: "image-1",
			path: "/Diagram.png",
		} satisfies Extract<WorkspaceContentReadResult, { status: "ready"; type: "file" }>;
		const references = createWorkspaceReadReferences([image]);
		const modelOutput = createWorkspaceReadItemsModelOutput({
			references,
			results: [image],
		});

		expect(references).toMatchObject([
			{ location: { itemId: "image-1", kind: "item", version: 1 } },
		]);
		expect(modelOutput.results[0]).toMatchObject({
			assetKind: "image",
			reference: expect.stringMatching(/^wr_[0-9A-Za-z]{8}$/),
		});
		expect(modelOutput.results[0]).not.toHaveProperty("pageReferences");
	});
});

function documentResult(): Extract<
	WorkspaceContentReadResult,
	{ status: "ready"; type: "document" }
> {
	return {
		content: "# Notes",
		format: "markdown",
		itemId: "document-1",
		location: { endLine: 1, kind: "lines", startLine: 1, totalLines: 1 },
		path: "/Notes",
		status: "ready",
		type: "document",
	};
}

function fileResult(): Extract<WorkspaceContentReadResult, { status: "ready"; type: "file" }> {
	return {
		assetKind: "pdf",
		content: "## Page 12\n\nAlpha\n\n## Page 13\n\nBeta",
		format: "markdown",
		itemId: "file-1",
		location: {
			kind: "pages",
			requested: "12-13",
			returned: [12, 13],
			total: 20,
		},
		path: "/Book.pdf",
		status: "ready",
		type: "file",
	};
}
