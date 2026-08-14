import { describe, expect, it } from "vitest";

import {
	applyFlashcardStudyRating,
	createEmptyFlashcardStudyState,
	parseFlashcardStudyState,
	summarizeFlashcardStudyProgress,
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

	it("summarizes only cards still in the set", () => {
		const [gotItId, missedId, unreviewedId, removedId] = Array.from({ length: 4 }, () =>
			crypto.randomUUID(),
		);
		const reviewedAt = "2026-08-13T12:00:00.000Z";
		const studyState = {
			kind: "flashcard" as const,
			cards: {
				[gotItId!]: { lastRating: "hard" as const, lastReviewedAt: reviewedAt, reviewCount: 1 },
				[missedId!]: { lastRating: "again" as const, lastReviewedAt: reviewedAt, reviewCount: 1 },
				[removedId!]: { lastRating: "good" as const, lastReviewedAt: reviewedAt, reviewCount: 1 },
			},
		};

		expect(
			summarizeFlashcardStudyProgress([gotItId!, missedId!, unreviewedId!], studyState),
		).toEqual({
			gotItCount: 1,
			missedCount: 1,
			reviewedCount: 2,
			totalCards: 3,
			unreviewedCount: 1,
		});
	});

	it("allows an empty study queue", () => {
		expect(summarizeFlashcardStudyProgress([], createEmptyFlashcardStudyState())).toEqual({
			gotItCount: 0,
			missedCount: 0,
			reviewedCount: 0,
			totalCards: 0,
			unreviewedCount: 0,
		});
	});
});
