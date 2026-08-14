import { describe, expect, it } from "vitest";

import {
	createWorkspaceReferenceRecords,
	getWorkspaceLocationKey,
	indexWorkspaceReferenceRecords,
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
				kind: "flashcard",
				cardId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
				version: 1,
			},
			"1:flashcard:item-1:f67080f9-0158-4565-86a9-4c90ed6809d2",
		],
		[
			{ blockId: "b_abcdefghijkl", itemId: "item-1", kind: "document-block", version: 1 },
			"1:document-block:item-1:b_abcdefghijkl",
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
		{ cardId: "not-a-uuid", itemId: "item-1", kind: "flashcard", version: 1 },
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

	it("retains editable revisions and makes conflicting transcript refs unusable", () => {
		const location = {
			blockId: "b_abcdefghijkl",
			itemId: "item-1",
			kind: "document-block",
			version: 1,
		} as const;
		const [record] = createWorkspaceReferenceRecords([{ location, revision: "0123456789" }], {
			createCandidate: () => "wr_AAAAAAAA",
		});

		expect(record).toEqual({ location, ref: "wr_AAAAAAAA", revision: "0123456789" });
		expect(
			indexWorkspaceReferenceRecords([record!, { ...record!, revision: "9876543210" }]).get(
				record!.ref,
			),
		).toBeNull();
	});

	it.each(["", "wr_short", "xx_AAAAAAAA", "wr_!!!!!!!!", "wr_AAAAAAAAA"])(
		"rejects malformed ref %s",
		(input) => {
			expect(parseWorkspaceReference(input)).toBeUndefined();
		},
	);
});
