import { describe, expect, it } from "vitest";

import { normalizeWorkspaceItemViewState } from "#/features/workspaces/model/workspace-item-view-state";

describe("normalizeWorkspaceItemViewState", () => {
	it("replaces non-finite viewer positions with valid defaults", () => {
		expect(
			normalizeWorkspaceItemViewState({
				kind: "flashcard",
				itemId: "cards-1",
				cardId: "card-1",
				cardNumber: Number.NaN,
				totalCards: Number.POSITIVE_INFINITY,
				gotItCount: Number.POSITIVE_INFINITY,
				missedCount: Number.NEGATIVE_INFINITY,
				setTotalCards: Number.POSITIVE_INFINITY,
				mode: "all",
				shuffled: false,
				side: "front",
			}),
		).toMatchObject({ cardNumber: 1, gotItCount: 0, missedCount: 0, totalCards: 1 });
	});
});
