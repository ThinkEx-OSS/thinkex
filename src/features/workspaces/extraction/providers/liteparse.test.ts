import { describe, expect, it } from "vitest";

import { parseLiteParsePage } from "#/features/workspaces/extraction/providers/liteparse-response";

describe("LiteParse response parsing", () => {
	it("accepts one canonical page record", () => {
		expect(parseLiteParsePage({ markdown: "  # First  ", pageNumber: 1 })).toEqual({
			markdown: "# First",
			pageNumber: 1,
		});
	});

	it("keeps blank pages so PDF page numbering remains stable", () => {
		expect(parseLiteParsePage({ markdown: " \n\t", pageNumber: 1 })).toEqual({
			markdown: "",
			pageNumber: 1,
		});
	});

	it.each([
		undefined,
		{},
		{ markdown: "document markdown without page data" },
		{ markdown: "Text", pageNumber: 0 },
		{ markdown: 123, pageNumber: 1 },
	])("rejects malformed container responses", (payload) => {
		expect(() => parseLiteParsePage(payload)).toThrow("LiteParse returned an invalid");
	});
});
