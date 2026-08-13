import type { Flashcard } from "#/features/workspaces/flashcards/flashcard-content";
import type { FlashcardStudyState } from "#/features/workspaces/flashcards/flashcard-study-state";

export type FlashcardStudyMode = "all" | "missed";

/** Builds one stable study queue without changing the set's authored order. */
export function createFlashcardStudyQueue(
	input: {
		cards: Flashcard[];
		mode: FlashcardStudyMode;
		shuffled: boolean;
		studyState: FlashcardStudyState;
	},
	random: () => number = Math.random,
) {
	const cardIds = input.cards
		.filter(
			(card) => input.mode === "all" || input.studyState.cards[card.id]?.lastRating === "again",
		)
		.map((card) => card.id);

	if (!input.shuffled) return cardIds;

	for (let index = cardIds.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[cardIds[index], cardIds[swapIndex]] = [cardIds[swapIndex]!, cardIds[index]!];
	}
	return cardIds;
}
