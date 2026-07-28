import { describe, expect, it } from "vitest";

import {
	createWorkspaceReferenceRecords,
	parseWorkspaceReference,
} from "#/features/workspaces/ai/workspace-reference";

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
