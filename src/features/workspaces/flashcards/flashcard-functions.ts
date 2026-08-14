import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	readFlashcardViewer,
	recordFlashcardStudyRating,
	resetFlashcardStudyProgress,
} from "#/features/workspaces/flashcards/flashcard-study-persistence";
import { flashcardStudyRatingSchema } from "#/features/workspaces/flashcards/flashcard-study-state";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";

const flashcardItemInputSchema = z.object({
	itemId: z.string().min(1),
	workspaceId: z.string().min(1),
});

export const getFlashcardViewerFn = createServerFn({ method: "GET" })
	.validator(flashcardItemInputSchema)
	.handler(async ({ data }) => {
		return await readFlashcardViewer({ ...data, userId: await getCurrentUserId() });
	});

export const recordFlashcardStudyRatingFn = createServerFn({ method: "POST" })
	.validator(
		flashcardItemInputSchema.extend({
			cardId: z.uuid(),
			rating: flashcardStudyRatingSchema,
		}),
	)
	.handler(async ({ data }) =>
		recordFlashcardStudyRating({ ...data, userId: await getCurrentUserId() }),
	);

export const resetFlashcardStudyProgressFn = createServerFn({ method: "POST" })
	.validator(flashcardItemInputSchema)
	.handler(async ({ data }) =>
		resetFlashcardStudyProgress({ ...data, userId: await getCurrentUserId() }),
	);
