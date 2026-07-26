import { describe, expect, it } from "vitest";

import {
	createWorkspaceReferenceRegistry,
	parseWorkspaceReference,
} from "#/features/workspaces/ai/workspace-reference";

describe("workspace reference", () => {
	it("creates an 11-character opaque reference", () => {
		const registry = createWorkspaceReferenceRegistry();
		const location = { itemId: "item-1", kind: "item", version: 1 } as const;
		const ref = registry.getOrCreate(location);

		expect(ref).toMatch(/^wr_[0-9A-Za-z]{8}$/);
		expect(ref).toHaveLength(11);
		expect(parseWorkspaceReference(ref)).toEqual({ ref, status: "parsed" });
	});

	it("reuses one ref for the same durable location", () => {
		const registry = createWorkspaceReferenceRegistry({
			createCandidate: () => "wr_AAAAAAAA",
		});
		const location = { itemId: "item-1", kind: "pdf-page", pageNumber: 7, version: 1 } as const;

		expect(registry.getOrCreate(location)).toBe("wr_AAAAAAAA");
		expect(registry.getOrCreate({ ...location })).toBe("wr_AAAAAAAA");
		expect(registry.records()).toEqual([{ location, ref: "wr_AAAAAAAA" }]);
	});

	it("retries a colliding candidate", () => {
		const candidates = ["wr_AAAAAAAA", "wr_AAAAAAAA", "wr_BBBBBBBB"];
		const registry = createWorkspaceReferenceRegistry({
			createCandidate: () => candidates.shift() ?? "wr_CCCCCCCC",
		});

		expect(registry.getOrCreate({ itemId: "item-1", kind: "item", version: 1 })).toBe(
			"wr_AAAAAAAA",
		);
		expect(registry.getOrCreate({ itemId: "item-2", kind: "item", version: 1 })).toBe(
			"wr_BBBBBBBB",
		);
	});

	it.each(["", "wr_short", "xx_AAAAAAAA", "wr_!!!!!!!!", "wr_AAAAAAAAA"])(
		"rejects malformed ref %s",
		(input) => {
			expect(parseWorkspaceReference(input)).toEqual({ status: "invalid" });
		},
	);
});
