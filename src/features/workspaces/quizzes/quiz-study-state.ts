import { z } from "zod";

import { workspaceEntryIdSchema } from "#/features/workspaces/locations/workspace-location";
import type { QuizQuestion } from "#/features/workspaces/quizzes/quiz-content";

/**
 * One user's current run through a quiz. Answers lock on selection — the
 * viewer grades immediately — and a retake resets the whole record, mirroring
 * flashcard study state. `kind` keeps the shared user-state rows
 * self-describing next to their flashcard siblings.
 */
export const multipleChoiceAnswerSchema = z.object({
	selectedOptionId: z.uuid(),
	answeredAt: z.string(),
});

export const shortAnswerSchema = z.object({
	textResponse: z.string().trim().min(1).max(4_000),
	correct: z.boolean(),
	feedback: z.string().trim().min(1).max(4_000),
	questionRevision: z.uuid(),
	answeredAt: z.string(),
});

export const quizAnswerSchema = z.union([shortAnswerSchema, multipleChoiceAnswerSchema]);

export type QuizAnswer = z.output<typeof quizAnswerSchema>;

export const quizStudyStateSchema = z.object({
	kind: z.literal("quiz"),
	answers: z.record(workspaceEntryIdSchema, quizAnswerSchema),
});

export type QuizStudyState = z.output<typeof quizStudyStateSchema>;

export const quizStudyProgressSchema = z.object({
	answeredCount: z.number().int().nonnegative(),
	correctCount: z.number().int().nonnegative(),
	incorrectCount: z.number().int().nonnegative(),
	totalQuestions: z.number().int().nonnegative(),
	unansweredCount: z.number().int().nonnegative(),
});

export type QuizStudyProgress = z.output<typeof quizStudyProgressSchema>;

export function createEmptyQuizStudyState(): QuizStudyState {
	return { kind: "quiz", answers: {} };
}

export function parseQuizStudyState(value: unknown): QuizStudyState {
	if (value === null || value === undefined) return createEmptyQuizStudyState();
	return quizStudyStateSchema.parse(value);
}

export function summarizeQuizStudyProgress(
	questions: ReadonlyArray<QuizQuestion>,
	state: QuizStudyState,
): QuizStudyProgress {
	let correctCount = 0;
	let incorrectCount = 0;

	for (const question of questions) {
		const answer = getQuizAnswer(question, state);
		if (!answer) continue;
		if (isQuizAnswerCorrect(question, answer)) correctCount += 1;
		else incorrectCount += 1;
	}

	const answeredCount = correctCount + incorrectCount;
	return {
		answeredCount,
		correctCount,
		incorrectCount,
		totalQuestions: questions.length,
		unansweredCount: questions.length - answeredCount,
	};
}

/**
 * The user's live answer to one question. An answer whose option no longer
 * exists — the question was re-authored since — reads as unanswered rather
 * than as a wrong pick the user never made.
 */
export function getQuizAnswer(
	question: QuizQuestion,
	state: QuizStudyState,
): QuizAnswer | undefined {
	const answer = state.answers[question.id];
	if (!answer) return undefined;
	if (question.kind === "short_answer") {
		return "textResponse" in answer && answer.questionRevision === question.gradingRevision
			? answer
			: undefined;
	}
	if (!("selectedOptionId" in answer)) return undefined;
	return question.options.some((option) => option.id === answer.selectedOptionId)
		? answer
		: undefined;
}

export function isQuizAnswerCorrect(question: QuizQuestion, answer: QuizAnswer | undefined) {
	if (!answer) return false;
	return question.kind === "short_answer"
		? "textResponse" in answer && answer.correct
		: "selectedOptionId" in answer && answer.selectedOptionId === question.correctOptionId;
}

export function applyQuizAnswer(
	state: QuizStudyState,
	input: { questionId: string; selectedOptionId: string; answeredAt: string },
): QuizStudyState {
	return {
		...state,
		answers: {
			...state.answers,
			[input.questionId]: {
				selectedOptionId: input.selectedOptionId,
				answeredAt: input.answeredAt,
			},
		},
	};
}
