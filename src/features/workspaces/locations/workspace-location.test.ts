import { describe, expect, it } from "vitest";

import {
	createWorkspaceReferenceRecords,
	getWorkspaceLocationKey,
	parseWorkspaceReference,
	workspaceLocationSchema,
} from "#/features/workspaces/locations/workspace-location";

describe("workspace location", () => {
	it.each([
		[{ itemId: "item-1", kind: "item", version: 1 }, "1:item:item-1"],
		[{ itemId: "item-1", kind: "pdf-page", pageNumber: 12, version: 1 }, "1:pdf-page:item-1:12"],
		[
			{
				itemId: "item-1",
				kind: "flashcard-side",
				cardId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
				side: "back",
				version: 1,
			},
			"1:flashcard-side:item-1:f67080f9-0158-4565-86a9-4c90ed6809d2:back",
		],
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
		{ cardId: "not-a-uuid", itemId: "item-1", kind: "flashcard-side", side: "front", version: 1 },
		{ blockId: "block-1", itemId: "item-1", kind: "document-block", version: 1 },
		{ itemId: "item-1", kind: "item", version: 2 },
		{ extra: true, itemId: "item-1", kind: "item", version: 1 },
	])("rejects invalid location %o", (input) => {
		expect(workspaceLocationSchema.safeParse(input).success).toBe(false);
	});
});

describe("workspace reference", () => {
	it("creates an 11-character opaque reference", () => {
		const location = { itemId: "item-1", kind: "item", version: 1 } as const;
		const [{ ref }] = createWorkspaceReferenceRecords([location]);

		expect(ref).toMatch(/^wr_[0-9A-Za-z]{8}$/);
		expect(ref).toHaveLength(11);
		expect(parseWorkspaceReference(ref)).toBe(ref);
	});

	it("reuses one ref for the same durable location", () => {
		const location = { itemId: "item-1", kind: "pdf-page", pageNumber: 7, version: 1 } as const;
		const records = createWorkspaceReferenceRecords([location, { ...location }], {
			createCandidate: () => "wr_AAAAAAAA",
		});

		expect(records).toEqual([{ location, ref: "wr_AAAAAAAA" }]);
	});

	it("retries a colliding candidate", () => {
		const candidates = ["wr_AAAAAAAA", "wr_AAAAAAAA", "wr_BBBBBBBB"];
		const records = createWorkspaceReferenceRecords(
			[
				{ itemId: "item-1", kind: "item", version: 1 },
				{ itemId: "item-2", kind: "item", version: 1 },
			],
			{
				createCandidate: () => candidates.shift() ?? "wr_CCCCCCCC",
			},
		);

		expect(records.map(({ ref }) => ref)).toEqual(["wr_AAAAAAAA", "wr_BBBBBBBB"]);
	});

	it.each(["", "wr_short", "xx_AAAAAAAA", "wr_!!!!!!!!", "wr_AAAAAAAAA"])(
		"rejects malformed ref %s",
		(input) => {
			expect(parseWorkspaceReference(input)).toBeUndefined();
		},
	);
});
