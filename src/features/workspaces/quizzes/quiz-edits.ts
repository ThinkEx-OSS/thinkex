import { z } from "zod";

import {
	applyOrderedEntryEdits,
	OrderedEntryEditError,
	type OrderedEntryEditTarget,
} from "#/features/workspaces/content/ordered-entry-edits";
import { replaceUniqueText } from "#/features/workspaces/content/replace-unique-text";
import {
	createQuizQuestionRevision,
	materializeQuizQuestion,
	parseQuizRichTextHtml,
	QUIZ_QUESTION_MAX_DISTRACTORS,
	QUIZ_QUESTION_MIN_DISTRACTORS,
	type QuizQuestion,
	type QuizSetContent,
} from "#/features/workspaces/quizzes/quiz-content";
import { entryRichTextHtmlSchema } from "#/features/workspaces/content/entry-rich-text";
import { serializeTiptapDocumentToHtml } from "#/features/workspaces/documents/document-ai-html";
import { workspaceUnitRefInputSchema } from "#/features/workspaces/locations/workspace-location";

const editTextSchema = z.string().max(8_000);

const authoredQuestionFields = {
	question: entryRichTextHtmlSchema.describe("HTML question stem."),
	correctAnswer: entryRichTextHtmlSchema.describe(
		"HTML for the single correct option. Never mark it in the stem; its final position is shuffled server-side.",
	),
	distractors: z
		.array(entryRichTextHtmlSchema)
		.min(QUIZ_QUESTION_MIN_DISTRACTORS)
		.max(QUIZ_QUESTION_MAX_DISTRACTORS)
		.describe(
			"HTML for each incorrect option: strictly wrong, plausible, and grounded in a specific misconception. Use 3 for a standard question, 1 for true/false.",
		),
	explanation: entryRichTextHtmlSchema.describe(
		"Short HTML explanation of why the correct answer is right, touching on why the others are not.",
	),
};

/** One authored question, as the create tool accepts it. */
export const quizQuestionInputSchema = z.object(authoredQuestionFields);

export const quizEditSchema = z.union([
	z.strictObject({
		op: z.enum(["insert_before", "insert_after"]),
		ref: workspaceUnitRefInputSchema,
		...authoredQuestionFields,
	}),
	z
		.strictObject({
			op: z.literal("update"),
			ref: workspaceUnitRefInputSchema,
			question: entryRichTextHtmlSchema.optional().describe("New HTML question stem."),
			explanation: entryRichTextHtmlSchema.optional().describe("New HTML explanation."),
		})
		.refine((value) => value.question !== undefined || value.explanation !== undefined, {
			message: "Provide a new question or explanation.",
		}),
	z.strictObject({
		op: z.literal("replace"),
		ref: workspaceUnitRefInputSchema,
		...authoredQuestionFields,
	}),
	z.strictObject({
		op: z.literal("replace_text"),
		ref: workspaceUnitRefInputSchema,
		field: z
			.enum(["question", "options", "explanation"])
			.describe("Where to look: the stem, all options together, or the explanation."),
		find: editTextSchema
			.min(1)
			.describe("Exact HTML text from the selected field. It must appear exactly once."),
		replace: editTextSchema.describe("Replacement text. May be empty."),
	}),
	z
		.strictObject({
			op: z.literal("move"),
			ref: workspaceUnitRefInputSchema,
			beforeRef: workspaceUnitRefInputSchema.optional(),
			afterRef: workspaceUnitRefInputSchema.optional(),
		})
		.refine((edit) => Boolean(edit.beforeRef) !== Boolean(edit.afterRef), {
			message: "Provide exactly one of beforeRef or afterRef.",
		}),
	z.strictObject({
		op: z.literal("delete"),
		ref: workspaceUnitRefInputSchema,
	}),
]);

export type QuizEdit = z.output<typeof quizEditSchema>;

export async function applyQuizEdits(
	content: QuizSetContent,
	edits: QuizEdit[],
	targets: ReadonlyMap<string, OrderedEntryEditTarget>,
) {
	const result = await applyOrderedEntryEdits({
		entries: content.questions,
		edits,
		targets,
		computeRevision: createQuizQuestionRevision,
		createEntry: createQuestionFromEdit,
		reviseEntry: reviseQuestion,
		lastEntryDetail: "A quiz needs at least one question.",
	});

	return {
		applied: result.applied,
		failed: result.failed,
		content: { ...content, questions: result.entries },
	};
}

function createQuestionFromEdit(edit: QuizEdit): QuizQuestion {
	if (edit.op !== "insert_before" && edit.op !== "insert_after") {
		throw new Error("Unsupported quiz edit.");
	}
	return materializeQuizQuestion(edit);
}

function reviseQuestion(question: QuizQuestion, edit: QuizEdit): QuizQuestion {
	if (edit.op === "update") {
		return {
			...question,
			...(edit.question === undefined ? {} : { question: parseQuizRichTextHtml(edit.question) }),
			...(edit.explanation === undefined
				? {}
				: { explanation: parseQuizRichTextHtml(edit.explanation) }),
		};
	}
	if (edit.op === "replace") {
		// A replace re-authors the whole question, so the options reshuffle.
		return { ...materializeQuizQuestion(edit), id: question.id };
	}
	if (edit.op === "replace_text") {
		return replaceQuestionText(question, edit);
	}
	throw new Error("Unsupported quiz edit.");
}

function replaceQuestionText(
	question: QuizQuestion,
	edit: Extract<QuizEdit, { op: "replace_text" }>,
): QuizQuestion {
	if (edit.field === "options") {
		// The find must be unique across every option so an in-place fix cannot
		// silently touch the wrong one — and it never reshuffles.
		const candidates: Array<{ index: number; text: string }> = [];
		let matchedTwiceInOne = false;
		for (const [index, option] of question.options.entries()) {
			const replaced = replaceUniqueText(
				serializeTiptapDocumentToHtml(option.text),
				edit.find,
				edit.replace,
			);
			if (replaced.ok) candidates.push({ index, text: replaced.text });
			else if (replaced.code === "edit_not_unique") matchedTwiceInOne = true;
		}
		if (candidates.length === 0 && !matchedTwiceInOne) {
			throw new OrderedEntryEditError(
				"edit_not_found",
				`No option matches: ${edit.find.slice(0, 80)}`,
			);
		}
		if (candidates.length !== 1 || matchedTwiceInOne) {
			throw new OrderedEntryEditError(
				"edit_not_unique",
				"The text matches more than one place; include more surrounding text so it matches once.",
			);
		}
		const candidate = candidates[0]!;
		const options = [...question.options];
		options[candidate.index] = {
			...options[candidate.index]!,
			text: parseQuizRichTextHtml(candidate.text),
		};
		return { ...question, options };
	}

	const replaced = replaceUniqueText(
		serializeTiptapDocumentToHtml(question[edit.field]),
		edit.find,
		edit.replace,
	);
	if (!replaced.ok) {
		throw new OrderedEntryEditError(replaced.code, replaced.detail);
	}
	return { ...question, [edit.field]: parseQuizRichTextHtml(replaced.text) };
}
