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
	it("gives document blocks and extracted pages one transcript-backed ref each", () => {
		const results = [documentResult(), fileResult()] satisfies WorkspaceContentReadResult[];
		const references = createWorkspaceReadReferences(results);

		expect(references).toHaveLength(3);
		expect(references.map(({ location }) => location)).toEqual([
			{
				blockId: "b_abcdefghijkl",
				itemId: "document-1",
				kind: "document-block",
				version: 1,
			},
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
			content: expect.stringMatching(/data-ref="wr_[0-9A-Za-z]{8}"/),
			path: "/Notes",
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

	it("gives each flashcard one ref for editing, citation, and navigation", () => {
		const results = [flashcardResult()] satisfies WorkspaceContentReadResult[];
		const references = createWorkspaceReadReferences(results);
		const modelOutput = createWorkspaceReadItemsModelOutput({ references, results });

		expect(references.map(({ location }) => location)).toEqual([
			{
				cardId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
				itemId: "flashcard-1",
				kind: "flashcard",
				version: 1,
			},
		]);
		expect(modelOutput.results[0]).toMatchObject({
			cards: [
				{
					back: "<p>Paris</p>",
					front: "<p>Capital of France?</p>",
					ref: expect.stringMatching(/^wr_[0-9A-Za-z]{8}$/),
				},
			],
			path: "/Geography",
			progress: { gotItCount: 1, missedCount: 0, reviewedCount: 1 },
			type: "flashcard",
		});
		expect(JSON.stringify(modelOutput)).not.toContain("flashcard-1");
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
			ref: expect.stringMatching(/^wr_[0-9A-Za-z]{8}$/),
		});
		expect(modelOutput.results[0]).not.toHaveProperty("pageReferences");
	});

	it("stays silent when every read succeeded outright", () => {
		const results = [documentResult(), fileResult()] satisfies WorkspaceContentReadResult[];

		expect(
			createWorkspaceReadItemsModelOutput({
				references: createWorkspaceReadReferences(results),
				results,
			}),
		).not.toHaveProperty("guidance");
	});

	it("explains a pending read once however many paths are waiting", () => {
		const results = [
			{
				elapsedSeconds: 4,
				itemId: "file-a",
				path: "/A.pdf",
				phase: "extracting",
				retryAfterSeconds: 15,
				status: "pending",
				type: "file",
			},
			{
				elapsedSeconds: 0,
				path: "/B.pdf",
				phase: "queued",
				retryAfterSeconds: 15,
				status: "pending",
				type: "file",
			},
		] satisfies WorkspaceContentReadResult[];
		const modelOutput = createWorkspaceReadItemsModelOutput({ references: [], results });
		const { guidance } = modelOutput;

		expect(guidance).toHaveLength(1);
		expect(guidance?.[0]).toContain("Never sleep");
		expect(JSON.stringify(modelOutput)).not.toContain("file-a");
	});

	it("separates failures that will never resolve from transient ones", () => {
		const results = [
			{ code: "extraction_failed", path: "/A.pdf", status: "failed", type: "file" },
			{ code: "extraction_stalled", path: "/B.pdf", status: "failed", type: "file" },
			{ code: "projection_failed", path: "/C.pdf", status: "failed", type: "file" },
		] satisfies WorkspaceContentReadResult[];
		const guidance = createWorkspaceReadItemsModelOutput({ references: [], results }).guidance;

		expect(guidance).toHaveLength(2);
		expect(guidance?.[0]).toContain("do not suggest re-uploading");
		expect(guidance?.[1]).toContain("One repeat read is reasonable");
	});

	it("says nothing about failures that are the caller's own mistake", () => {
		const results = [
			{ code: "path_not_found", path: "/Missing.pdf", status: "failed" },
		] satisfies WorkspaceContentReadResult[];

		expect(createWorkspaceReadItemsModelOutput({ references: [], results })).not.toHaveProperty(
			"guidance",
		);
	});

	it("warns that blank pages from the fast pass are not final", () => {
		const results = [
			{ ...fileResult(), emptyPages: [13], provisional: true },
		] satisfies WorkspaceContentReadResult[];
		const guidance = createWorkspaceReadItemsModelOutput({
			references: createWorkspaceReadReferences(results),
			results,
		}).guidance;

		expect(guidance).toHaveLength(1);
		expect(guidance?.[0]).toContain("still extracting");
	});

	it("stays silent about blank pages on a final, non-provisional read", () => {
		const results = [{ ...fileResult(), emptyPages: [13] }] satisfies WorkspaceContentReadResult[];

		expect(
			createWorkspaceReadItemsModelOutput({
				references: createWorkspaceReadReferences(results),
				results,
			}),
		).not.toHaveProperty("guidance");
	});
});

function documentResult(): Extract<
	WorkspaceContentReadResult,
	{ status: "ready"; type: "document" }
> {
	return {
		content: '<h1 data-ref="b_abcdefghijkl.r_0123456789">Notes</h1>',
		format: "html",
		itemId: "document-1",
		location: { endBlock: 1, kind: "blocks", startBlock: 1, totalBlocks: 1 },
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

function flashcardResult(): Extract<
	WorkspaceContentReadResult,
	{ status: "ready"; type: "flashcard" }
> {
	return {
		cards: [
			{
				back: "<p>Paris</p>",
				cardId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
				revision: "0123456789",
				front: "<p>Capital of France?</p>",
				study: {
					lastRating: "good",
					lastReviewedAt: "2026-08-13T12:00:00.000Z",
					reviewCount: 1,
				},
			},
		],
		format: "html",
		itemId: "flashcard-1",
		location: { kind: "cards", returned: [1], total: 1 },
		path: "/Geography",
		progress: {
			gotItCount: 1,
			missedCount: 0,
			reviewedCount: 1,
			totalCards: 1,
			unreviewedCount: 0,
		},
		status: "ready",
		type: "flashcard",
	};
}
