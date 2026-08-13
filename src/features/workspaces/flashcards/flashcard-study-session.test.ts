import { describe, expect, it } from "vitest";

import type { Flashcard } from "#/features/workspaces/flashcards/flashcard-content";
import { createFlashcardStudyQueue } from "#/features/workspaces/flashcards/flashcard-study-session";
import type { FlashcardStudyState } from "#/features/workspaces/flashcards/flashcard-study-state";

const cards = [
	"11111111-1111-4111-8111-111111111111",
	"22222222-2222-4222-8222-222222222222",
	"33333333-3333-4333-8333-333333333333",
].map((id) => ({ id }) as Flashcard);

const studyState: FlashcardStudyState = {
	kind: "flashcard",
	cards: {
		[cards[0]!.id]: {
			lastRating: "again",
			lastReviewedAt: "2026-08-13T12:00:00.000Z",
			reviewCount: 1,
		},
		[cards[1]!.id]: {
			lastRating: "good",
			lastReviewedAt: "2026-08-13T12:00:00.000Z",
			reviewCount: 1,
		},
	},
};

describe("flashcard study queue", () => {
	it("keeps authored order for an unshuffled all-cards session", () => {
		expect(createFlashcardStudyQueue({ cards, mode: "all", shuffled: false, studyState })).toEqual(
			cards.map((card) => card.id),
		);
	});

	it("starts a missed-only session from cards whose latest rating is Again", () => {
		expect(
			createFlashcardStudyQueue({ cards, mode: "missed", shuffled: false, studyState }),
		).toEqual([cards[0]!.id]);
	});

	it("shuffles a session without mutating authored order", () => {
		const authoredOrder = cards.map((card) => card.id);
		const queue = createFlashcardStudyQueue(
			{ cards, mode: "all", shuffled: true, studyState },
			() => 0,
		);

		expect(queue).toEqual([authoredOrder[1], authoredOrder[2], authoredOrder[0]]);
		expect(cards.map((card) => card.id)).toEqual(authoredOrder);
	});
});
