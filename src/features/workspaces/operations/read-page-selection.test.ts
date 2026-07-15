import { describe, expect, it } from "vitest";

import { parseWorkspacePageRange } from "#/features/workspaces/read-page-selection";

describe("workspace read page selection", () => {
	it("returns sorted unique page numbers", () => {
		expect(parseWorkspacePageRange("3, 1-2, 2", 3)).toEqual([1, 2, 3]);
	});

	it("rejects out-of-range page requests", () => {
		expect(() => parseWorkspacePageRange("4", 3)).toThrow(
			expect.objectContaining({ code: "page_range_out_of_range" }),
		);
	});

	it("rejects selections larger than the shared read limit", () => {
		expect(() => parseWorkspacePageRange("1-21", 21)).toThrow(
			expect.objectContaining({ code: "page_selection_too_large" }),
		);
	});
});
