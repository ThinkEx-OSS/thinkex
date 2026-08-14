import { describe, expect, it } from "vitest";

import {
	applyFlashcardStudyRating,
	createEmptyFlashcardStudyState,
	parseFlashcardStudyState,
} from "#/features/workspaces/flashcards/flashcard-study-state";

describe("flashcard study state", () => {
	it("keeps valid private review history", () => {
		const cardId = crypto.randomUUID();
		const state = {
			kind: "flashcard" as const,
			cards: {
				[cardId]: {
					lastRating: "easy" as const,
					lastReviewedAt: "2026-08-13T12:00:00.000Z",
					reviewCount: 2,
				},
			},
		};

		expect(parseFlashcardStudyState(state)).toEqual(state);
	});

	it("starts empty but rejects damaged persisted state", () => {
		expect(parseFlashcardStudyState(null)).toEqual(createEmptyFlashcardStudyState());
		expect(() => parseFlashcardStudyState({ kind: "quiz", cards: {} })).toThrow();
	});

	it("records the latest rating and increments the review count", () => {
		const cardId = crypto.randomUUID();
		const first = applyFlashcardStudyRating(createEmptyFlashcardStudyState(), {
			cardId,
			rating: "again",
			reviewedAt: "2026-08-13T12:00:00.000Z",
		});

		expect(
			applyFlashcardStudyRating(first, {
				cardId,
				rating: "good",
				reviewedAt: "2026-08-13T12:01:00.000Z",
			}).cards[cardId],
		).toEqual({
			lastRating: "good",
			lastReviewedAt: "2026-08-13T12:01:00.000Z",
			reviewCount: 2,
		});
	});
});
