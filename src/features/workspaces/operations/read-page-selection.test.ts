import { describe, expect, it } from "vitest";

import {
	parseWorkspacePageRange,
	WorkspacePageSelectionError,
} from "#/features/workspaces/read-page-selection";

describe("workspace read page selection", () => {
	it("returns sorted unique page numbers", () => {
		expect(parseWorkspacePageRange("3, 1-2, 2", 3)).toEqual([1, 2, 3]);
	});

	it("rejects out-of-range page requests", () => {
		expect(() => parseWorkspacePageRange("4", 3)).toThrow(WorkspacePageSelectionError);
	});
});
