import { describe, expect, it } from "vitest";

import {
	parseMarkdownToTiptapDocumentProjection,
	serializeTiptapDocumentToMarkdown,
} from "#/features/workspaces/documents/document-markdown";

describe("document Markdown", () => {
	it("round-trips subscript and superscript marks", () => {
		const markdown = "Water is H~2~O and the area is x^2^.";
		const document = parseMarkdownToTiptapDocumentProjection(markdown).document;

		expect(document.content).toEqual([
			{
				type: "paragraph",
				attrs: { textAlign: null },
				content: [
					{ type: "text", text: "Water is H" },
					{ type: "text", marks: [{ type: "subscript" }], text: "2" },
					{ type: "text", text: "O and the area is x" },
					{ type: "text", marks: [{ type: "superscript" }], text: "2" },
					{ type: "text", text: "." },
				],
			},
		]);
		expect(serializeTiptapDocumentToMarkdown(document)).toBe(markdown);
	});

	it("keeps strikethrough distinct from subscript syntax", () => {
		const markdown = "Keep ~~removed~~ text separate from H~2~O.";
		const document = parseMarkdownToTiptapDocumentProjection(markdown).document;

		expect(serializeTiptapDocumentToMarkdown(document)).toBe(markdown);
	});
});
