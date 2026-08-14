import { z } from "zod";

export const flashcardStudyRatingSchema = z.enum(["again", "hard", "good", "easy"]);
export type FlashcardStudyRating = z.output<typeof flashcardStudyRatingSchema>;

export const flashcardReviewSchema = z.object({
	lastRating: flashcardStudyRatingSchema,
	lastReviewedAt: z.string(),
	reviewCount: z.number().int().nonnegative(),
});

export const flashcardStudyStateSchema = z.object({
	kind: z.literal("flashcard"),
	cards: z.record(z.uuid(), flashcardReviewSchema),
});

export type FlashcardStudyState = z.output<typeof flashcardStudyStateSchema>;

export const flashcardStudyProgressSchema = z.object({
	gotItCount: z.number().int().nonnegative(),
	missedCount: z.number().int().nonnegative(),
	reviewedCount: z.number().int().nonnegative(),
	totalCards: z.number().int().positive(),
	unreviewedCount: z.number().int().nonnegative(),
});

export type FlashcardStudyProgress = z.output<typeof flashcardStudyProgressSchema>;

export function createEmptyFlashcardStudyState(): FlashcardStudyState {
	return { kind: "flashcard", cards: {} };
}

export function parseFlashcardStudyState(value: unknown): FlashcardStudyState {
	if (value === null || value === undefined) return createEmptyFlashcardStudyState();
	return flashcardStudyStateSchema.parse(value);
}

export function summarizeFlashcardStudyProgress(
	cardIds: readonly string[],
	state: FlashcardStudyState,
): FlashcardStudyProgress {
	let gotItCount = 0;
	let missedCount = 0;

	for (const cardId of cardIds) {
		const rating = state.cards[cardId]?.lastRating;
		if (rating === "again") missedCount += 1;
		else if (rating) gotItCount += 1;
	}

	const reviewedCount = gotItCount + missedCount;
	return {
		gotItCount,
		missedCount,
		reviewedCount,
		totalCards: cardIds.length,
		unreviewedCount: cardIds.length - reviewedCount,
	};
}

export function applyFlashcardStudyRating(
	state: FlashcardStudyState,
	input: { cardId: string; rating: FlashcardStudyRating; reviewedAt: string },
): FlashcardStudyState {
	return {
		...state,
		cards: {
			...state.cards,
			[input.cardId]: {
				lastRating: input.rating,
				lastReviewedAt: input.reviewedAt,
				reviewCount: (state.cards[input.cardId]?.reviewCount ?? 0) + 1,
			},
		},
	};
}
