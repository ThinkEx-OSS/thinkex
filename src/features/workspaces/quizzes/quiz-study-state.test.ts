import { describe, expect, it } from "vitest";

import { createQuizSetFromInputs } from "#/features/workspaces/quizzes/quiz-content";
import {
	applyQuizAnswer,
	createEmptyQuizStudyState,
	getQuizAnswer,
	parseQuizStudyState,
	summarizeQuizStudyProgress,
} from "#/features/workspaces/quizzes/quiz-study-state";

const set = createQuizSetFromInputs([
	{
		question: "<p>2 + 2?</p>",
		correctAnswer: "<p>4</p>",
		distractors: ["<p>5</p>"],
		explanation: "<p>Basic addition.</p>",
	},
	{
		question: "<p>3 + 3?</p>",
		correctAnswer: "<p>6</p>",
		distractors: ["<p>7</p>"],
		explanation: "<p>Basic addition.</p>",
	},
]);
const [first, second] = set.questions;

describe("quiz study state", () => {
	it("summarizes correct, incorrect, and unanswered questions", () => {
		let state = createEmptyQuizStudyState();
		state = applyQuizAnswer(state, {
			questionId: first!.id,
			selectedOptionId: first!.correctOptionId,
			answeredAt: "2026-08-14T00:00:00.000Z",
		});
		const wrongOption = second!.options.find((option) => option.id !== second!.correctOptionId)!;
		state = applyQuizAnswer(state, {
			questionId: second!.id,
			selectedOptionId: wrongOption.id,
			answeredAt: "2026-08-14T00:00:00.000Z",
		});

		expect(summarizeQuizStudyProgress(set.questions, state)).toEqual({
			answeredCount: 2,
			correctCount: 1,
			incorrectCount: 1,
			totalQuestions: 2,
			unansweredCount: 0,
		});
	});

	it("treats an answer to a re-authored question as unanswered", () => {
		const state = applyQuizAnswer(createEmptyQuizStudyState(), {
			questionId: first!.id,
			selectedOptionId: crypto.randomUUID(),
			answeredAt: "2026-08-14T00:00:00.000Z",
		});

		expect(getQuizAnswer(first!, state)).toBeUndefined();
		expect(summarizeQuizStudyProgress(set.questions, state).answeredCount).toBe(0);
	});

	it("parses stored state and defaults missing state to empty", () => {
		expect(parseQuizStudyState(null)).toEqual({ kind: "quiz", answers: {} });
		expect(() => parseQuizStudyState({ kind: "flashcard", cards: {} })).toThrow();
	});
});
