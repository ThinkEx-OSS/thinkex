import { describe, expect, it } from "vitest";

import {
	getWorkspaceLocationKey,
	parseWorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";

describe("workspace location", () => {
	it.each([
		[{ itemId: "item-1", kind: "item", version: 1 }, "1:item:item-1"],
		[{ itemId: "item-1", kind: "pdf-page", pageNumber: 12, version: 1 }, "1:pdf-page:item-1:12"],
	])("parses and keys %o", (input, expectedKey) => {
		const result = parseWorkspaceLocation(input);

		expect(result.status).toBe("parsed");
		if (result.status === "parsed") {
			expect(getWorkspaceLocationKey(result.location)).toBe(expectedKey);
		}
	});

	it.each([
		{ itemId: "", kind: "item", version: 1 },
		{ itemId: "item-1", kind: "pdf-page", pageNumber: 0, version: 1 },
		{ blockId: "block-1", itemId: "item-1", kind: "document-block", version: 1 },
		{ itemId: "item-1", kind: "item", version: 2 },
		{ extra: true, itemId: "item-1", kind: "item", version: 1 },
	])("rejects invalid location %o", (input) => {
		expect(parseWorkspaceLocation(input)).toEqual({ status: "invalid" });
	});
});
