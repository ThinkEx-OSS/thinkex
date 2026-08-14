import { describe, expect, it } from "vitest";

import type { Flashcard } from "#/features/workspaces/flashcards/flashcard-content";
import {
	createFlashcardStudyQueue,
	getFlashcardStudyViewState,
} from "#/features/workspaces/flashcards/flashcard-study-session";
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

	it("identifies the authored card separately from its filtered-session position", () => {
		expect(
			getFlashcardStudyViewState({
				currentRating: "again",
				flipped: false,
				mode: "missed",
				progress: {
					gotItCount: 1,
					missedCount: 1,
					reviewedCount: 2,
					totalCards: 5,
					unreviewedCount: 3,
				},
				sessionPosition: 1,
				sessionTotal: 1,
				shuffled: false,
				sourceCardNumber: 3,
			}),
		).toEqual({
			label: "card 3",
			detail:
				"card 3 of 5, front shown, set progress: 2 of 5 reviewed (1 got it, 1 missed), session: missed cards, position 1 of 1, original order, marked no",
		});
	});
});
