import { describe, expect, it } from "vitest";

import {
	createQuizQuestionRevision,
	createQuizSetFromInputs,
	materializeQuizQuestion,
	parseQuizSetContent,
	serializeQuizSetToHtml,
	stringifyQuizSetContent,
} from "#/features/workspaces/quizzes/quiz-content";
import { applyQuizEdits, quizQuestionInputSchema } from "#/features/workspaces/quizzes/quiz-edits";
import {
	createEmptyQuizStudyState,
	getQuizAnswer,
	parseQuizStudyState,
	summarizeQuizStudyProgress,
} from "#/features/workspaces/quizzes/quiz-study-state";
import { createQuizStudyQueue } from "#/features/workspaces/quizzes/quiz-study-session";
import { buildWorkspaceItemSearchText } from "#/features/workspaces/search/workspace-search-text";

const input = {
	kind: "short_answer" as const,
	question: "<p>Explain how ATP supplies energy.</p>",
	modelAnswer: "<p>ATP hydrolysis releases energy coupled to cellular work.</p>",
	gradingCriteria: "Mention hydrolysis and coupling to cellular work. Accept equivalent wording.",
	explanation: "<p>Cells couple ATP hydrolysis to energy-requiring reactions.</p>",
};

function answeredState(question: ReturnType<typeof materializeShortQuestion>, correct = true) {
	return parseQuizStudyState({
		kind: "quiz",
		answers: {
			[question.id]: {
				textResponse: "Hydrolysis supplies energy for cellular work.",
				correct,
				feedback: correct
					? "You connected hydrolysis to cellular work."
					: "Explain how the energy is coupled to cellular work.",
				questionRevision: question.gradingRevision,
				answeredAt: "2026-10-04T00:00:00.000Z",
			},
		},
	});
}

function materializeShortQuestion() {
	return materializeQuizQuestion(input);
}

describe("short-answer quiz content", () => {
	it("accepts authorship and round-trips model answers and grading criteria", () => {
		expect(quizQuestionInputSchema.parse(input)).toEqual(input);
		const set = createQuizSetFromInputs([input]);
		expect(parseQuizSetContent(stringifyQuizSetContent(set))).toEqual(set);
		expect(serializeQuizSetToHtml(set)[0]).toMatchObject({
			kind: "short_answer",
			options: [],
			modelAnswer: input.modelAnswer,
			gradingCriteria: input.gradingCriteria,
		});
		expect(buildWorkspaceItemSearchText("quiz", stringifyQuizSetContent(set))).toContain(
			"coupling to cellular work",
		);
	});

	it("requires a rubric and rejects tampered grading revisions", () => {
		expect(quizQuestionInputSchema.safeParse({ ...input, gradingCriteria: " " }).success).toBe(
			false,
		);
		expect(() => materializeQuizQuestion({ ...input, gradingCriteria: " " })).toThrow(
			"grading criteria",
		);
		const set = createQuizSetFromInputs([input]);
		set.questions[0]!.gradingRevision = "invalid";
		expect(() => parseQuizSetContent(stringifyQuizSetContent(set))).toThrow("grading criteria");
	});

	it("invalidates a saved grade when a model answer is edited", async () => {
		const set = createQuizSetFromInputs([input]);
		const question = set.questions[0]!;
		const state = answeredState(question);
		const ref = "wr_AAAAAAAA";
		const targets = new Map([
			[ref, { entryId: question.id, revision: await createQuizQuestionRevision(question) }],
		]);
		const result = await applyQuizEdits(
			set,
			[
				{
					op: "replace_text",
					ref,
					field: "modelAnswer",
					find: "cellular work",
					replace: "active transport",
				},
			],
			targets,
		);
		expect(result.failed).toEqual([]);
		expect(result.content.questions[0]!.id).toBe(question.id);
		expect(getQuizAnswer(result.content.questions[0]!, state)).toBeUndefined();
	});

	it("rejects editing nonexistent options on a short-answer question", async () => {
		const set = createQuizSetFromInputs([input]);
		const question = set.questions[0]!;
		const ref = "wr_AAAAAAAA";
		const targets = new Map([
			[ref, { entryId: question.id, revision: await createQuizQuestionRevision(question) }],
		]);
		const result = await applyQuizEdits(
			set,
			[{ op: "replace_text", ref, field: "options", find: "energy", replace: "heat" }],
			targets,
		);
		expect(result.applied).toBe(0);
		expect(result.failed).toHaveLength(1);
	});
});

describe("short-answer quiz progress", () => {
	it("counts AI verdicts and includes incorrect responses in missed-question sessions", () => {
		const question = materializeShortQuestion();
		const state = answeredState(question, false);
		expect(summarizeQuizStudyProgress([question], state)).toMatchObject({
			answeredCount: 1,
			correctCount: 0,
			incorrectCount: 1,
		});
		expect(
			createQuizStudyQueue({
				questions: [question],
				studyState: state,
				mode: "missed",
				shuffled: false,
			}),
		).toEqual([question.id]);
		expect(summarizeQuizStudyProgress([question], answeredState(question))).toMatchObject({
			correctCount: 1,
			incorrectCount: 0,
		});
	});

	it("does not accept a multiple-choice answer as a short-answer submission", () => {
		const question = materializeShortQuestion();
		const state = parseQuizStudyState({
			kind: "quiz",
			answers: {
				[question.id]: { selectedOptionId: crypto.randomUUID(), answeredAt: "2026-10-04" },
			},
		});
		expect(getQuizAnswer(question, state)).toBeUndefined();
		expect(getQuizAnswer(question, createEmptyQuizStudyState())).toBeUndefined();
	});
});
