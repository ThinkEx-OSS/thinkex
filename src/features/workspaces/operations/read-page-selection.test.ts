import { describe, expect, it } from "vitest";

import {
	readWorkspaceProjectionPages,
	WorkspacePageSelectionError,
} from "#/features/workspaces/operations/read-page-selection";

describe("workspace read page selection", () => {
	it("returns an empty first page for empty ready projections", () => {
		expect(readWorkspaceProjectionPages([], {})).toEqual({
			content: "",
			pages: {
				requested: "1",
				returned: [1],
				total: 1,
			},
		});
	});

	it("rejects out-of-range empty projection page requests", () => {
		expect(() => readWorkspaceProjectionPages([], { pages: "2" })).toThrow(
			WorkspacePageSelectionError,
		);
	});
});
