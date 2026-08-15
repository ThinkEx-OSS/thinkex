import { describe, expect, it } from "vitest";

import {
	parseWorkspaceAddress,
	parseWorkspaceUnitRef,
	resolveWorkspaceAddressLocation,
	workspaceLocationSchema,
} from "#/features/workspaces/locations/workspace-location";

describe("workspace addresses", () => {
	it("parses item, unit, and revisioned forms", () => {
		expect(parseWorkspaceAddress("Xk7p2Qa9")).toEqual({ refKey: "Xk7p2Qa9" });
		expect(parseWorkspaceAddress("Xk7p2Qa9/p12")).toEqual({ refKey: "Xk7p2Qa9", unit: "p12" });
		expect(parseWorkspaceAddress("Xk7p2Qa9/b_x7Kp2Qa9x8Lm.r_4f2a1b")).toEqual({
			refKey: "Xk7p2Qa9",
			unit: "b_x7Kp2Qa9x8Lm",
			revision: "4f2a1b",
		});
		expect(parseWorkspaceAddress("not an address")).toBeUndefined();
		expect(parseWorkspaceAddress("wr_7Kp2Qa9x")).toBeUndefined();
	});

	it("interprets units against the item's type", () => {
		const address = parseWorkspaceAddress("Xk7p2Qa9/p12")!;
		expect(resolveWorkspaceAddressLocation({ id: "item-1", type: "file" }, address)).toEqual({
			itemId: "item-1",
			kind: "pdf-page",
			pageNumber: 12,
			version: 1,
		});
		// The same unit means nothing on a document.
		expect(
			resolveWorkspaceAddressLocation({ id: "item-1", type: "document" }, address),
		).toBeUndefined();

		expect(
			resolveWorkspaceAddressLocation(
				{ id: "item-1", type: "flashcard" },
				parseWorkspaceAddress("Xk7p2Qa9/c_9xKp2Qab")!,
			),
		).toEqual({ cardId: "c_9xKp2Qab", itemId: "item-1", kind: "flashcard", version: 1 });
		expect(
			resolveWorkspaceAddressLocation(
				{ id: "item-1", type: "quiz" },
				parseWorkspaceAddress("Xk7p2Qa9/f67080f9-0158-4565-86a9-4c90ed6809d2")!,
			),
		).toEqual({
			itemId: "item-1",
			kind: "quiz-question",
			questionId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
			version: 1,
		});
		expect(
			resolveWorkspaceAddressLocation(
				{ id: "item-1", type: "document" },
				parseWorkspaceAddress("Xk7p2Qa9")!,
			),
		).toEqual({ itemId: "item-1", kind: "item", version: 1 });
	});

	it("parses edit unit refs with their revision", () => {
		expect(parseWorkspaceUnitRef("b_x7Kp2Qa9x8Lm.r_4f2a1b")).toEqual({
			unit: "b_x7Kp2Qa9x8Lm",
			revision: "4f2a1b",
		});
		expect(parseWorkspaceUnitRef("b_x7Kp2Qa9x8Lm")).toBeUndefined();
	});

	it("keeps persisted locations validating legacy and short entry ids", () => {
		expect(
			workspaceLocationSchema.safeParse({
				cardId: "f67080f9-0158-4565-86a9-4c90ed6809d2",
				itemId: "item-1",
				kind: "flashcard",
				version: 1,
			}).success,
		).toBe(true);
		expect(
			workspaceLocationSchema.safeParse({
				cardId: "c_9xKp2Qab",
				itemId: "item-1",
				kind: "flashcard",
				version: 1,
			}).success,
		).toBe(true);
		expect(
			workspaceLocationSchema.safeParse({
				cardId: "not-an-id",
				itemId: "item-1",
				kind: "flashcard",
				version: 1,
			}).success,
		).toBe(false);
	});
});
