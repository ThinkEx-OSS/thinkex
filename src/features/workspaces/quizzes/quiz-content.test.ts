import { describe, expect, it } from "vitest";

import {
	createQuizSetFromInputs,
	materializeQuizQuestion,
	parseQuizSetContent,
	serializeQuizSetToHtml,
	stringifyQuizSetContent,
} from "#/features/workspaces/quizzes/quiz-content";

const atpQuestion = {
	question: "<p>What does ATP provide?</p>",
	correctAnswer: "<p>Usable energy</p>",
	distractors: ["<p>Genetic information</p>", "<p>Structural support</p>", "<p>Oxygen storage</p>"],
	explanation: "<p>ATP transfers readily usable energy.</p>",
};

describe("materializeQuizQuestion", () => {
	it("shuffles the correct answer in and records which option it became", () => {
		const question = materializeQuizQuestion(atpQuestion);

		expect(question.kind).toBe("multiple_choice");
		expect(question.options).toHaveLength(4);
		const serialized = serializeQuizSetToHtml({ version: 1, questions: [question] })[0]!;
		const correct = serialized.options.filter((option) => option.correct);
		expect(correct).toHaveLength(1);
		expect(correct[0]!.text).toBe("<p>Usable energy</p>");
	});

	it("does not always place the correct answer first", () => {
		const positions = new Set(
			Array.from({ length: 40 }, () => {
				const question = materializeQuizQuestion(atpQuestion);
				return question.options.findIndex((option) => option.id === question.correctOptionId);
			}),
		);
		expect(positions.size).toBeGreaterThan(1);
	});

	it("rejects duplicate options and bad distractor counts", () => {
		expect(() =>
			materializeQuizQuestion({ ...atpQuestion, distractors: ["<p>Usable energy</p>"] }),
		).toThrow("distinct");
		expect(() => materializeQuizQuestion({ ...atpQuestion, distractors: [] })).toThrow(
			"1 to 4 distractors",
		);
	});

	it("rejects content outside the entry rich-text dialect", () => {
		expect(() =>
			materializeQuizQuestion({ ...atpQuestion, question: "<h1>Heading stem</h1>" }),
		).toThrow("Quiz content cannot contain heading nodes.");
	});
});

describe("parseQuizSetContent", () => {
	it("round-trips a stored quiz", () => {
		const set = createQuizSetFromInputs([atpQuestion]);
		const parsed = parseQuizSetContent(stringifyQuizSetContent(set));
		expect(parsed).toEqual(set);
	});

	it("rejects empty, malformed, and tampered content", () => {
		expect(() => parseQuizSetContent(null)).toThrow("Quiz content is missing.");
		expect(() => parseQuizSetContent('{"version":1,"questions":[]}')).toThrow(
			"at least one question",
		);
		const set = createQuizSetFromInputs([atpQuestion]);
		const tampered = {
			...set,
			questions: [{ ...set.questions[0]!, correctOptionId: crypto.randomUUID() }],
		};
		expect(() => parseQuizSetContent(JSON.stringify(tampered))).toThrow("without a correct option");
	});
});
