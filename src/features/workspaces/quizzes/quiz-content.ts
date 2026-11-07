import {
	parseEntryRichTextHtml,
	parseStoredEntryRichText,
} from "#/features/workspaces/content/entry-rich-text";
import { serializeTiptapDocumentToHtml } from "#/features/workspaces/documents/document-ai-html";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import {
	createWorkspaceEntryId,
	workspaceEntryIdSchema,
} from "#/features/workspaces/locations/workspace-location";
import { sha256Base64UrlText } from "#/lib/binary";
import { isRecord } from "#/lib/record";
import { shuffleInPlace } from "#/lib/shuffle";

export const QUIZ_SET_VERSION = 1;
const quizIdSchema = workspaceEntryIdSchema;

export const QUIZ_QUESTION_MIN_DISTRACTORS = 1;
export const QUIZ_QUESTION_MAX_DISTRACTORS = 4;

/**
 * One quiz question as stored. Options hold their display order: the server
 * shuffled the correct answer in at creation, because models place unshuffled
 * correct answers at predictable positions.
 */
export interface MultipleChoiceQuizQuestion {
	id: string;
	kind: "multiple_choice";
	question: TiptapDocumentJson;
	options: QuizOption[];
	correctOptionId: string;
	explanation: TiptapDocumentJson;
}

export interface ShortAnswerQuizQuestion {
	id: string;
	kind: "short_answer";
	question: TiptapDocumentJson;
	modelAnswer: TiptapDocumentJson;
	gradingCriteria: string;
	gradingRevision: string;
	explanation: TiptapDocumentJson;
}

export type QuizQuestion = MultipleChoiceQuizQuestion | ShortAnswerQuizQuestion;

export interface QuizOption {
	id: string;
	text: TiptapDocumentJson;
}

export interface QuizSetContent {
	version: typeof QUIZ_SET_VERSION;
	questions: QuizQuestion[];
}

/**
 * What the model authors: the correct answer stays a separate field and never
 * carries a position, and the explanation is written in the same pass as the
 * question so an incoherent one surfaces a bad question before it is stored.
 */
export interface MultipleChoiceQuizQuestionInput {
	kind?: "multiple_choice";
	question: string;
	correctAnswer: string;
	distractors: string[];
	explanation: string;
}

export interface ShortAnswerQuizQuestionInput {
	kind: "short_answer";
	question: string;
	modelAnswer: string;
	gradingCriteria: string;
	explanation: string;
}

export type QuizQuestionInput = MultipleChoiceQuizQuestionInput | ShortAnswerQuizQuestionInput;

export function parseQuizRichTextHtml(html: string) {
	return parseEntryRichTextHtml(html, "Quiz");
}

export function createQuizSetFromInputs(
	questions: MultipleChoiceQuizQuestionInput[],
): QuizSetContent & { questions: MultipleChoiceQuizQuestion[] };
export function createQuizSetFromInputs(
	questions: ShortAnswerQuizQuestionInput[],
): QuizSetContent & { questions: ShortAnswerQuizQuestion[] };
export function createQuizSetFromInputs(questions: QuizQuestionInput[]): QuizSetContent;
export function createQuizSetFromInputs(questions: QuizQuestionInput[]) {
	if (questions.length === 0) throw new Error("A quiz needs at least one question.");
	return {
		version: QUIZ_SET_VERSION,
		questions: questions.map((question) => materializeQuizQuestion(question)),
	} satisfies QuizSetContent;
}

/**
 * Parses one authored question and shuffles the correct answer in among the
 * distractors. Storing the shuffled order keeps every reader — users, edits,
 * and citations — on one stable arrangement.
 */
export function materializeQuizQuestion(
	input: MultipleChoiceQuizQuestionInput,
): MultipleChoiceQuizQuestion;
export function materializeQuizQuestion(
	input: ShortAnswerQuizQuestionInput,
): ShortAnswerQuizQuestion;
export function materializeQuizQuestion(input: QuizQuestionInput): QuizQuestion;
export function materializeQuizQuestion(input: QuizQuestionInput): QuizQuestion {
	if (input.kind === "short_answer") {
		if (!input.gradingCriteria.trim() || input.gradingCriteria.length > 4_000) {
			throw new Error("A short-answer question needs grading criteria of at most 4000 characters.");
		}
		return {
			id: createWorkspaceEntryId("q"),
			kind: "short_answer",
			question: parseEntryRichTextHtml(input.question, "Quiz"),
			modelAnswer: parseEntryRichTextHtml(input.modelAnswer, "Quiz"),
			gradingCriteria: input.gradingCriteria.trim(),
			gradingRevision: crypto.randomUUID(),
			explanation: parseEntryRichTextHtml(input.explanation, "Quiz"),
		};
	}
	if (
		input.distractors.length < QUIZ_QUESTION_MIN_DISTRACTORS ||
		input.distractors.length > QUIZ_QUESTION_MAX_DISTRACTORS
	) {
		throw new Error(
			`A question needs ${QUIZ_QUESTION_MIN_DISTRACTORS} to ${QUIZ_QUESTION_MAX_DISTRACTORS} distractors.`,
		);
	}

	const correct = {
		id: crypto.randomUUID(),
		text: parseEntryRichTextHtml(input.correctAnswer, "Quiz"),
	};
	const options = [
		correct,
		...input.distractors.map((distractor) => ({
			id: crypto.randomUUID(),
			text: parseEntryRichTextHtml(distractor, "Quiz"),
		})),
	];
	assertDistinctOptions(options);
	shuffleInPlace(options);

	return {
		id: createWorkspaceEntryId("q"),
		kind: "multiple_choice",
		question: parseEntryRichTextHtml(input.question, "Quiz"),
		options,
		correctOptionId: correct.id,
		explanation: parseEntryRichTextHtml(input.explanation, "Quiz"),
	};
}

export function parseQuizSetContent(content: string | null): QuizSetContent {
	if (!content?.trim()) {
		throw new Error("Quiz content is missing.");
	}

	const value: unknown = JSON.parse(content);
	if (!isRecord(value) || value.version !== QUIZ_SET_VERSION || !Array.isArray(value.questions)) {
		throw new Error("Quiz content has an unsupported format.");
	}
	if (value.questions.length === 0) {
		throw new Error("A quiz needs at least one question.");
	}

	const seenIds = new Set<string>();
	const questions = value.questions.map((question) => {
		if (
			!isRecord(question) ||
			!["multiple_choice", "short_answer"].includes(String(question.kind))
		) {
			throw new Error("Quiz content contains an unsupported question kind.");
		}
		const questionId = quizIdSchema.safeParse(question.id);
		if (!questionId.success) {
			throw new Error("Quiz content contains an invalid question ID.");
		}
		if (seenIds.has(questionId.data)) {
			throw new Error("Quiz content contains a duplicate question ID.");
		}
		seenIds.add(questionId.data);
		if (question.kind === "short_answer") {
			if (
				typeof question.gradingCriteria !== "string" ||
				!question.gradingCriteria.trim() ||
				question.gradingCriteria.length > 4_000 ||
				!quizIdSchema.safeParse(question.gradingRevision).success
			) {
				throw new Error("Quiz content contains invalid short-answer grading criteria.");
			}
			return {
				id: questionId.data,
				kind: "short_answer" as const,
				question: parseStoredEntryRichText(question.question, "Quiz"),
				modelAnswer: parseStoredEntryRichText(question.modelAnswer, "Quiz"),
				gradingCriteria: question.gradingCriteria,
				gradingRevision: question.gradingRevision as string,
				explanation: parseStoredEntryRichText(question.explanation, "Quiz"),
			};
		}

		if (
			!Array.isArray(question.options) ||
			question.options.length < QUIZ_QUESTION_MIN_DISTRACTORS + 1 ||
			question.options.length > QUIZ_QUESTION_MAX_DISTRACTORS + 1
		) {
			throw new Error("Quiz content contains a question with an invalid option count.");
		}
		const seenOptionIds = new Set<string>();
		const options = question.options.map((option) => {
			if (!isRecord(option)) {
				throw new Error("Quiz content contains an invalid option.");
			}
			const optionId = quizIdSchema.safeParse(option.id);
			if (!optionId.success || seenOptionIds.has(optionId.data)) {
				throw new Error("Quiz content contains an invalid option ID.");
			}
			seenOptionIds.add(optionId.data);
			return { id: optionId.data, text: parseStoredEntryRichText(option.text, "Quiz") };
		});
		if (
			typeof question.correctOptionId !== "string" ||
			!seenOptionIds.has(question.correctOptionId)
		) {
			throw new Error("Quiz content contains a question without a correct option.");
		}

		return {
			id: questionId.data,
			kind: "multiple_choice" as const,
			question: parseStoredEntryRichText(question.question, "Quiz"),
			options,
			correctOptionId: question.correctOptionId,
			explanation: parseStoredEntryRichText(question.explanation, "Quiz"),
		};
	});

	return { version: QUIZ_SET_VERSION, questions };
}

export function stringifyQuizSetContent(content: QuizSetContent) {
	return `${JSON.stringify(content)}\n`;
}

export async function createQuizQuestionRevision(question: QuizQuestion) {
	return (
		await sha256Base64UrlText(
			JSON.stringify(
				question.kind === "short_answer"
					? {
							question: question.question,
							modelAnswer: question.modelAnswer,
							gradingCriteria: question.gradingCriteria,
							explanation: question.explanation,
							gradingRevision: question.gradingRevision,
						}
					: {
							correctOptionId: question.correctOptionId,
							explanation: question.explanation,
							options: question.options,
							question: question.question,
						},
			),
		)
	).slice(0, 6);
}

export interface QuizHtmlQuestion {
	id: string;
	kind: QuizQuestion["kind"];
	question: string;
	options: Array<{ id: string; text: string; correct: boolean }>;
	modelAnswer?: string;
	gradingCriteria?: string;
	explanation: string;
}

export function serializeQuizSetToHtml(content: QuizSetContent): QuizHtmlQuestion[] {
	return content.questions.map((question) => ({
		id: question.id,
		kind: question.kind,
		question: serializeTiptapDocumentToHtml(question.question),
		options:
			question.kind === "multiple_choice"
				? question.options.map((option) => ({
						id: option.id,
						text: serializeTiptapDocumentToHtml(option.text),
						correct: option.id === question.correctOptionId,
					}))
				: [],
		...(question.kind === "short_answer"
			? {
					modelAnswer: serializeTiptapDocumentToHtml(question.modelAnswer),
					gradingCriteria: question.gradingCriteria,
				}
			: {}),
		explanation: serializeTiptapDocumentToHtml(question.explanation),
	}));
}

function assertDistinctOptions(options: QuizOption[]) {
	const seen = new Set<string>();
	for (const option of options) {
		const key = serializeTiptapDocumentToHtml(option.text);
		if (seen.has(key)) {
			throw new Error("Every option in a question must be distinct.");
		}
		seen.add(key);
	}
}
