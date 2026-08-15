import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { workspaceEntryIdSchema } from "#/features/workspaces/locations/workspace-location";

import {
	readQuizViewer,
	recordQuizAnswer,
	resetQuizStudyProgress,
} from "#/features/workspaces/quizzes/quiz-study-persistence";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";

const quizItemInputSchema = z.object({
	itemId: z.string().min(1),
	workspaceId: z.string().min(1),
});

export const getQuizViewerFn = createServerFn({ method: "GET" })
	.validator(quizItemInputSchema)
	.handler(async ({ data }) => {
		return await readQuizViewer({ ...data, userId: await getCurrentUserId() });
	});

export const recordQuizAnswerFn = createServerFn({ method: "POST" })
	.validator(
		quizItemInputSchema.extend({
			questionId: workspaceEntryIdSchema,
			selectedOptionId: z.uuid(),
		}),
	)
	.handler(async ({ data }) => recordQuizAnswer({ ...data, userId: await getCurrentUserId() }));

export const resetQuizStudyProgressFn = createServerFn({ method: "POST" })
	.validator(quizItemInputSchema)
	.handler(async ({ data }) =>
		resetQuizStudyProgress({ ...data, userId: await getCurrentUserId() }),
	);
