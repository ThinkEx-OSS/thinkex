import type { QuizQuestion } from "#/features/workspaces/quizzes/quiz-content";
import {
	getQuizAnswer,
	type QuizStudyProgress,
	type QuizStudyState,
} from "#/features/workspaces/quizzes/quiz-study-state";
import { shuffleInPlace } from "#/lib/shuffle";

export type QuizStudyMode = "all" | "missed";

/** Builds one stable question queue without changing the quiz's stored order. */
export function createQuizStudyQueue(
	input: {
		questions: QuizQuestion[];
		mode: QuizStudyMode;
		shuffled: boolean;
		studyState: QuizStudyState;
	},
	random: () => number = Math.random,
) {
	const questionIds: string[] = [];
	for (const question of input.questions) {
		const answer = getQuizAnswer(question, input.studyState);
		const missed = answer !== undefined && answer.selectedOptionId !== question.correctOptionId;
		if (input.mode === "all" || missed) {
			questionIds.push(question.id);
		}
	}

	return input.shuffled ? shuffleInPlace(questionIds, random) : questionIds;
}

/** What the AI's live view context says about the open quiz. */
export function getQuizStudyViewState(input: {
	answered: boolean;
	correct?: boolean;
	mode: QuizStudyMode;
	progress: QuizStudyProgress;
	sessionPosition: number;
	sessionTotal: number;
	shuffled: boolean;
	sourceQuestionNumber: number;
}) {
	const answerState = input.answered
		? `answered ${input.correct ? "correctly" : "incorrectly"}`
		: "not answered yet";
	const order = input.shuffled ? "shuffled" : "original order";
	const mode = input.mode === "missed" ? "missed questions" : "all questions";
	return {
		label: `question ${input.sourceQuestionNumber}`,
		detail: `question ${input.sourceQuestionNumber} of ${input.progress.totalQuestions}, ${answerState}, quiz progress: ${input.progress.answeredCount} of ${input.progress.totalQuestions} answered (${input.progress.correctCount} correct, ${input.progress.incorrectCount} incorrect), session: ${mode}, position ${input.sessionPosition} of ${input.sessionTotal}, ${order}`,
	};
}
