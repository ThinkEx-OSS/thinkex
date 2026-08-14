import type { Flashcard } from "#/features/workspaces/flashcards/flashcard-content";
import type {
	FlashcardStudyProgress,
	FlashcardStudyRating,
	FlashcardStudyState,
} from "#/features/workspaces/flashcards/flashcard-study-state";

export type FlashcardStudyMode = "all" | "missed";

export function getFlashcardStudyViewState(input: {
	currentRating?: FlashcardStudyRating;
	flipped: boolean;
	mode: FlashcardStudyMode;
	progress: FlashcardStudyProgress;
	sessionPosition: number;
	sessionTotal: number;
	shuffled: boolean;
	sourceCardNumber: number;
}) {
	const side = input.flipped ? "back shown" : "front shown";
	const order = input.shuffled ? "shuffled" : "original order";
	const mode = input.mode === "missed" ? "missed cards" : "all cards";
	const rating = input.currentRating
		? `, marked ${input.currentRating === "again" ? "no" : input.currentRating === "good" ? "yes" : input.currentRating}`
		: "";
	return {
		label: `card ${input.sourceCardNumber}`,
		detail: `card ${input.sourceCardNumber} of ${input.progress.totalCards}, ${side}, set progress: ${input.progress.reviewedCount} of ${input.progress.totalCards} reviewed (${input.progress.gotItCount} got it, ${input.progress.missedCount} missed), session: ${mode}, position ${input.sessionPosition} of ${input.sessionTotal}, ${order}${rating}`,
	};
}

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
	const cardIds: string[] = [];
	for (const card of input.cards) {
		if (input.mode === "all" || input.studyState.cards[card.id]?.lastRating === "again") {
			cardIds.push(card.id);
		}
	}

	if (!input.shuffled) return cardIds;

	for (let index = cardIds.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[cardIds[index], cardIds[swapIndex]] = [cardIds[swapIndex]!, cardIds[index]!];
	}
	return cardIds;
}
