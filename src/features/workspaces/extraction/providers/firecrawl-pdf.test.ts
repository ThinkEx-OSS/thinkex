import { describe, expect, it } from "vitest";

import {
	buildFirecrawlPdfParseOptions,
	getFirecrawlPdfPages,
} from "#/features/workspaces/extraction/providers/firecrawl-pdf";

describe("Firecrawl PDF extraction", () => {
	it("forces OCR and requests physical page Markdown", () => {
		expect(buildFirecrawlPdfParseOptions()).toMatchObject({
			formats: ["markdown"],
			parsers: [{ type: "pdf", mode: "ocr", pages: true }],
		});
	});

	it("preserves page numbers and blank physical pages", () => {
		expect(
			getFirecrawlPdfPages({
				pages: [
					{ pageNumber: 1, markdown: " first " },
					{ pageNumber: 2, markdown: "" },
					{ pageNumber: 3, markdown: "third" },
				],
			}),
		).toEqual([
			{ pageNumber: 1, markdown: "first" },
			{ pageNumber: 2, markdown: "" },
			{ pageNumber: 3, markdown: "third" },
		]);
	});
});
