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
				mode: "all",
				shuffled: false,
				side: "front",
				reviewedCount: Number.NEGATIVE_INFINITY,
			}),
		).toMatchObject({ cardNumber: 1, reviewedCount: 0, totalCards: 1 });
	});
});
