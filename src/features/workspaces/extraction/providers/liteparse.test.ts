import { describe, expect, it } from "vitest";

import { parseLiteParseMarkdownProjection } from "#/features/workspaces/extraction/providers/liteparse-response";

describe("LiteParse response parsing", () => {
	it("accepts rendered document Markdown", () => {
		expect(
			parseLiteParseMarkdownProjection({
				markdown: "  # First\n\nSecond  ",
			}),
		).toEqual([{ markdown: "# First\n\nSecond", pageNumber: 1 }]);
	});

	it("returns no projection pages for blank Markdown", () => {
		expect(parseLiteParseMarkdownProjection({ markdown: " \n\t" })).toEqual([]);
	});

	it.each([undefined, {}, { markdown: 123 }, { pages: [{ markdown: "Text", pageNumber: 1 }] }])(
		"rejects malformed container responses",
		(payload) => {
			expect(() => parseLiteParseMarkdownProjection(payload)).toThrow(
				"LiteParse returned an invalid",
			);
		},
	);
});
