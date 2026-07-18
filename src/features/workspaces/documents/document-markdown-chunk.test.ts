import { describe, expect, it } from "vitest";

import { createDocumentMarkdownSnapshot } from "#/features/workspaces/documents/document-markdown-chunk";

describe("document Markdown snapshots", () => {
	it("preserves exact content and indexed line locations across chunks", () => {
		const markdown = `heading  \n\n${"x".repeat(64_000)}\ntail\n`;
		const snapshot = createDocumentMarkdownSnapshot(markdown);
		const first = snapshot.readChunk(0);
		if (!first?.nextOffset) {
			throw new Error("Expected a continuation offset.");
		}
		const second = snapshot.readChunk(first.nextOffset);
		if (!second) {
			throw new Error("Expected a second chunk.");
		}

		expect(first.content + second.content).toBe(markdown);
		expect(first.location).toEqual({ endLine: 3, startLine: 1, totalLines: 5 });
		expect(second.location).toEqual({ endLine: 5, startLine: 3, totalLines: 5 });
	});

	it("rejects nonzero offsets for empty or exhausted snapshots", () => {
		expect(createDocumentMarkdownSnapshot("").readChunk(1)).toBeUndefined();
		expect(createDocumentMarkdownSnapshot("text").readChunk(4)).toBeUndefined();
	});
});
