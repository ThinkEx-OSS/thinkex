import { z } from "zod";

export const flashcardStudyRatingSchema = z.enum(["again", "hard", "good", "easy"]);
export type FlashcardStudyRating = z.output<typeof flashcardStudyRatingSchema>;

const flashcardReviewSchema = z.object({
	lastRating: flashcardStudyRatingSchema,
	lastReviewedAt: z.string(),
	reviewCount: z.number().int().nonnegative(),
});

export const flashcardStudyStateSchema = z.object({
	kind: z.literal("flashcard"),
	cards: z.record(z.uuid(), flashcardReviewSchema),
});

export type FlashcardStudyState = z.output<typeof flashcardStudyStateSchema>;

export function createEmptyFlashcardStudyState(): FlashcardStudyState {
	return { kind: "flashcard", cards: {} };
}

export function parseFlashcardStudyState(value: unknown): FlashcardStudyState {
	const parsed = flashcardStudyStateSchema.safeParse(value);
	return parsed.success ? parsed.data : createEmptyFlashcardStudyState();
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
