import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	createQuizSetFromInputs,
	stringifyQuizSetContent,
} from "#/features/workspaces/quizzes/quiz-content";
import { recordQuizShortAnswer } from "#/features/workspaces/quizzes/quiz-study-persistence";

const mocks = vi.hoisted(() => ({
	rows: [] as unknown[][],
	grade: vi.fn(),
	authorize: vi.fn(),
	save: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("#/features/workspaces/server/permissions", () => ({
	assertCanReadWorkspace: mocks.authorize,
}));
vi.mock("#/features/workspaces/quizzes/quiz-grading", () => ({ gradeQuizResponse: mocks.grade }));
vi.mock("#/db/server", () => {
	const transaction = {
		select: () => {
			const query = {
				from: () => query,
				innerJoin: () => query,
				where: () => query,
				limit: () => query,
				for: () => Promise.resolve(mocks.rows.shift()),
			};
			return query;
		},
		insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
		update: () => ({
			set: (value: unknown) => ({
				where: async () => {
					mocks.save(value);
				},
			}),
		}),
	};
	return {
		withDb: (callback: (db: unknown) => unknown) =>
			callback({ transaction: (fn: (tx: unknown) => unknown) => fn(transaction) }),
	};
});

const set = createQuizSetFromInputs([
	{
		kind: "short_answer",
		question: "<p>Explain ATP hydrolysis.</p>",
		modelAnswer: "<p>It releases energy for cellular work.</p>",
		gradingCriteria: "Mention hydrolysis and cellular work.",
		explanation: "<p>Energy release can drive other reactions.</p>",
	},
]);
const question = set.questions[0]!;
const input = {
	itemId: "quiz-1",
	questionId: question.id,
	textResponse: "Hydrolysis releases energy for work.",
	userId: "student-1",
	workspaceId: "workspace-1",
};
const updatedAt = new Date("2026-10-04T00:00:00.000Z");
const emptyRow = { state: { kind: "quiz", answers: {} }, updatedAt };
const contentRow = { content: stringifyQuizSetContent(set) };

beforeEach(() => {
	vi.clearAllMocks();
	mocks.rows = [[contentRow], [emptyRow], [contentRow], [emptyRow]];
	mocks.authorize.mockResolvedValue(undefined);
	mocks.grade.mockResolvedValue({
		correct: true,
		feedback: "You connected hydrolysis to cellular work.",
	});
});

describe("short-answer submission persistence", () => {
	it("persists server-generated feedback with the response and grading revision", async () => {
		const state = await recordQuizShortAnswer(input);
		expect(state.answers[question.id]).toMatchObject({
			correct: true,
			textResponse: input.textResponse,
			questionRevision: question.gradingRevision,
		});
		expect(mocks.save).toHaveBeenCalledOnce();
		expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), input);
	});

	it("rejects unauthorized grading before calling the model", async () => {
		mocks.authorize.mockRejectedValue(new Error("Forbidden"));
		await expect(recordQuizShortAnswer(input)).rejects.toThrow("Forbidden");
		expect(mocks.grade).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("returns a previous answer without grading or charging again", async () => {
		const previous = {
			kind: "quiz",
			answers: {
				[question.id]: {
					textResponse: "Previous response",
					correct: false,
					feedback: "Mention cellular work.",
					questionRevision: question.gradingRevision,
					answeredAt: updatedAt.toISOString(),
				},
			},
		};
		mocks.rows[1] = [{ state: previous, updatedAt }];
		expect(await recordQuizShortAnswer(input)).toEqual(previous);
		expect(mocks.grade).not.toHaveBeenCalled();
	});

	it("does not save failed grading as an incorrect answer", async () => {
		mocks.grade.mockRejectedValue(new Error("Provider timeout"));
		await expect(recordQuizShortAnswer(input)).rejects.toThrow("Provider timeout");
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("rejects a grade if the rubric changes while the request is running", async () => {
		mocks.rows[2] = [
			{
				content: stringifyQuizSetContent({
					...set,
					questions: [{ ...question, gradingRevision: crypto.randomUUID() }],
				}),
			},
		];
		await expect(recordQuizShortAnswer(input)).rejects.toThrow("question changed");
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("does not restore an answer after a concurrent quiz reset", async () => {
		mocks.rows[3] = [{ ...emptyRow, updatedAt: new Date(updatedAt.getTime() + 1_000) }];
		await expect(recordQuizShortAnswer(input)).rejects.toThrow("progress changed");
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it("keeps the first result if another tab submits while grading", async () => {
		const previous = {
			kind: "quiz",
			answers: {
				[question.id]: {
					textResponse: "Other tab response",
					correct: false,
					feedback: "Mention cellular work.",
					questionRevision: question.gradingRevision,
					answeredAt: updatedAt.toISOString(),
				},
			},
		};
		mocks.rows[3] = [{ state: previous, updatedAt: new Date(updatedAt.getTime() + 1_000) }];
		expect(await recordQuizShortAnswer(input)).toEqual(previous);
		expect(mocks.save).not.toHaveBeenCalled();
	});
});
