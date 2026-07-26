import { describe, expect, it } from "vitest";

import {
	getWorkspaceLocationKey,
	workspaceLocationSchema,
} from "#/features/workspaces/locations/workspace-location";

describe("workspace location", () => {
	it.each([
		[{ itemId: "item-1", kind: "item", version: 1 }, "1:item:item-1"],
		[{ itemId: "item-1", kind: "pdf-page", pageNumber: 12, version: 1 }, "1:pdf-page:item-1:12"],
	])("parses and keys %o", (input, expectedKey) => {
		const result = workspaceLocationSchema.safeParse(input);

		expect(result.success).toBe(true);
		if (result.success) {
			expect(getWorkspaceLocationKey(result.data)).toBe(expectedKey);
		}
	});

	it.each([
		{ itemId: "", kind: "item", version: 1 },
		{ itemId: "item-1", kind: "pdf-page", pageNumber: 0, version: 1 },
		{ blockId: "block-1", itemId: "item-1", kind: "document-block", version: 1 },
		{ itemId: "item-1", kind: "item", version: 2 },
		{ extra: true, itemId: "item-1", kind: "item", version: 1 },
	])("rejects invalid location %o", (input) => {
		expect(workspaceLocationSchema.safeParse(input).success).toBe(false);
	});
});
