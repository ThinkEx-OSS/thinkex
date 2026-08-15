import { describe, expect, it } from "vitest";

import {
	createQuizQuestionRevision,
	createQuizSetFromInputs,
	type QuizQuestion,
} from "#/features/workspaces/quizzes/quiz-content";
import { serializeTiptapDocumentToHtml } from "#/features/workspaces/documents/document-ai-html";
import { applyQuizEdits, quizEditSchema } from "#/features/workspaces/quizzes/quiz-edits";

const firstQuestion = {
	question: "<p>What does ATP provide?</p>",
	correctAnswer: "<p>Usable energy</p>",
	distractors: ["<p>Genetic information</p>"],
	explanation: "<p>ATP transfers energy.</p>",
};
const secondQuestion = {
	question: "<p>Where does glycolysis happen?</p>",
	correctAnswer: "<p>The cytoplasm</p>",
	distractors: ["<p>The nucleus</p>"],
	explanation: "<p>Glycolysis happens in the cytoplasm.</p>",
};

describe("applyQuizEdits", () => {
	it("supports the shared edit verbs while preserving question identity", async () => {
		const set = createQuizSetFromInputs([firstQuestion, secondQuestion]);
		const [first, second] = set.questions;
		const { refs, targets } = await createTargets(first!, second!);
		const [firstRef, secondRef] = refs;

		const result = await applyQuizEdits(
			set,
			[
				{ op: "insert_before", ref: secondRef!, ...firstQuestion, question: "<p>Extra?</p>" },
				{ op: "update", ref: secondRef!, explanation: "<p>Updated explanation.</p>" },
				{
					op: "replace_text",
					ref: secondRef!,
					field: "options",
					find: "The nucleus",
					replace: "The mitochondria",
				},
				{ op: "move", ref: firstRef!, afterRef: secondRef! },
				{ op: "replace", ref: firstRef!, ...firstQuestion, question: "<p>Rewritten?</p>" },
			],
			targets,
		);

		expect(result.failed).toEqual([]);
		expect(result.applied).toBe(5);
		expect(result.content.questions).toHaveLength(3);
		const revisedSecond = result.content.questions.find((entry) => entry.id === second!.id)!;
		expect(serializeTiptapDocumentToHtml(revisedSecond.explanation)).toBe(
			"<p>Updated explanation.</p>",
		);
		expect(
			revisedSecond.options.map((option) => serializeTiptapDocumentToHtml(option.text)),
		).toContain("<p>The mitochondria</p>");
		// replace keeps the id so citations to the question survive re-authoring.
		expect(result.content.questions.some((entry) => entry.id === first!.id)).toBe(true);
	});

	it("keeps the correct option correct after an in-place option fix", async () => {
		const set = createQuizSetFromInputs([firstQuestion]);
		const question = set.questions[0]!;
		const { refs, targets } = await createTargets(question);

		const result = await applyQuizEdits(
			set,
			[
				{
					op: "replace_text",
					ref: refs[0]!,
					field: "options",
					find: "Usable energy",
					replace: "Readily usable energy",
				},
			],
			targets,
		);

		expect(result.failed).toEqual([]);
		const revised = result.content.questions[0]!;
		const correct = revised.options.find((option) => option.id === revised.correctOptionId)!;
		expect(serializeTiptapDocumentToHtml(correct.text)).toBe("<p>Readily usable energy</p>");
	});

	it("rejects option fixes that match more than one option", async () => {
		const set = createQuizSetFromInputs([
			{ ...firstQuestion, distractors: ["<p>Usable heat</p>"] },
		]);
		const { refs, targets } = await createTargets(set.questions[0]!);

		const result = await applyQuizEdits(
			set,
			[{ op: "replace_text", ref: refs[0]!, field: "options", find: "Usable", replace: "Free" }],
			targets,
		);

		expect(result.applied).toBe(0);
		expect(result.failed).toMatchObject([{ code: "edit_not_unique", index: 0 }]);
	});

	it("reports stale refs, missing refs, and last-question deletes", async () => {
		const set = createQuizSetFromInputs([firstQuestion]);
		const { refs, targets } = await createTargets(set.questions[0]!);
		const changed = createQuizSetFromInputs([secondQuestion]);
		changed.questions[0]!.id = set.questions[0]!.id;

		const stale = await applyQuizEdits(
			changed,
			[{ op: "update", ref: refs[0]!, question: "<p>New?</p>" }],
			targets,
		);
		expect(stale.failed).toMatchObject([{ code: "ref_stale", index: 0 }]);

		const result = await applyQuizEdits(
			set,
			[
				{ op: "delete", ref: "wr_ZZZZZZZZ" },
				{ op: "delete", ref: refs[0]! },
			],
			targets,
		);
		expect(result.failed).toMatchObject([
			{ code: "ref_not_found", index: 0 },
			{ code: "cannot_delete_last_entry", index: 1 },
		]);
	});

	it("requires an explicit destination for moves", () => {
		const ref = "wr_AAAAAAAA";
		expect(quizEditSchema.safeParse({ op: "move", ref }).success).toBe(false);
		expect(
			quizEditSchema.safeParse({
				op: "move",
				ref,
				beforeRef: "wr_BBBBBBBB",
				afterRef: "wr_CCCCCCCC",
			}).success,
		).toBe(false);
	});
});

async function createTargets(...questions: QuizQuestion[]) {
	const refs = questions.map((_, index) => `wr_${String(index).padStart(8, "A")}`);
	const targets = new Map(
		await Promise.all(
			questions.map(
				async (question, index) =>
					[
						refs[index]!,
						{ entryId: question.id, revision: await createQuizQuestionRevision(question) },
					] as const,
			),
		),
	);
	return { refs, targets };
}
