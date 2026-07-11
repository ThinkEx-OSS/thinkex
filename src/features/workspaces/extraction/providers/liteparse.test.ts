import { describe, expect, it } from "vitest";

import { parseLiteParsePages } from "#/features/workspaces/extraction/providers/liteparse-response";

describe("LiteParse response parsing", () => {
	it("accepts canonical per-page Markdown", () => {
		expect(
			parseLiteParsePages({
				pages: [
					{ markdown: "  # First  ", pageNumber: 1 },
					{ markdown: "\nSecond\n", pageNumber: 2 },
				],
			}),
		).toEqual([
			{ markdown: "# First", pageNumber: 1 },
			{ markdown: "Second", pageNumber: 2 },
		]);
	});

	it("keeps blank pages for the projection serializer to filter", () => {
		expect(parseLiteParsePages({ pages: [{ markdown: " \n\t", pageNumber: 1 }] })).toEqual([
			{ markdown: "", pageNumber: 1 },
		]);
	});

	it.each([
		undefined,
		{},
		{ markdown: "document markdown without page data" },
		{ pages: "invalid" },
		{ pages: [{ markdown: "Text", pageNumber: 0 }] },
		{ pages: [{ markdown: 123, pageNumber: 1 }] },
	])("rejects malformed container responses", (payload) => {
		expect(() => parseLiteParsePages(payload)).toThrow("LiteParse returned an invalid");
	});
});
