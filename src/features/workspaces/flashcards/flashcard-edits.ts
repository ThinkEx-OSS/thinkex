import { z } from "zod";

import {
	applyOrderedEntryEdits,
	OrderedEntryEditError,
	type OrderedEntryEditTarget,
} from "#/features/workspaces/content/ordered-entry-edits";
import { replaceUniqueText } from "#/features/workspaces/content/replace-unique-text";
import {
	createFlashcardRevision,
	flashcardSideHtmlSchema,
	parseFlashcardSideHtml,
	serializeFlashcardSideToHtml,
	type Flashcard,
	type FlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";
import {
	createWorkspaceEntryId,
	workspaceUnitRefInputSchema,
} from "#/features/workspaces/locations/workspace-location";

const editTextSchema = z.string().max(8_000);

export const flashcardEditSchema = z.union([
	z.strictObject({
		op: z.enum(["insert_before", "insert_after"]),
		ref: workspaceUnitRefInputSchema,
		front: flashcardSideHtmlSchema,
		back: flashcardSideHtmlSchema,
	}),
	z
		.strictObject({
			op: z.literal("update"),
			ref: workspaceUnitRefInputSchema,
			front: flashcardSideHtmlSchema.optional(),
			back: flashcardSideHtmlSchema.optional(),
		})
		.refine((value) => value.front !== undefined || value.back !== undefined, {
			message: "Provide a new front or back.",
		}),
	z.strictObject({
		op: z.literal("replace"),
		ref: workspaceUnitRefInputSchema,
		front: flashcardSideHtmlSchema,
		back: flashcardSideHtmlSchema,
	}),
	z.strictObject({
		op: z.literal("replace_text"),
		ref: workspaceUnitRefInputSchema,
		side: z.enum(["front", "back"]),
		find: editTextSchema
			.min(1)
			.describe("Exact HTML text from the selected side. It must appear exactly once."),
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

export type FlashcardEdit = z.output<typeof flashcardEditSchema>;
export type FlashcardEditTarget = OrderedEntryEditTarget;

export async function applyFlashcardEdits(
	content: FlashcardSetContent,
	edits: FlashcardEdit[],
	targets: ReadonlyMap<string, FlashcardEditTarget>,
) {
	const result = await applyOrderedEntryEdits({
		entries: content.cards,
		edits,
		targets,
		computeRevision: createFlashcardRevision,
		createEntry: createCardFromEdit,
		reviseEntry: reviseCard,
		lastEntryDetail: "A flashcard set needs at least one card.",
	});

	return {
		applied: result.applied,
		failed: result.failed,
		content: { ...content, cards: result.entries },
	};
}

function createCardFromEdit(edit: FlashcardEdit): Flashcard {
	if (edit.op !== "insert_before" && edit.op !== "insert_after") {
		throw new Error("Unsupported flashcard edit.");
	}
	return {
		id: createWorkspaceEntryId("c"),
		front: parseFlashcardSideHtml(edit.front),
		back: parseFlashcardSideHtml(edit.back),
	};
}

function reviseCard(card: Flashcard, edit: FlashcardEdit): Flashcard {
	if (edit.op === "update") {
		return {
			...card,
			...(edit.front === undefined ? {} : { front: parseFlashcardSideHtml(edit.front) }),
			...(edit.back === undefined ? {} : { back: parseFlashcardSideHtml(edit.back) }),
		};
	}
	if (edit.op === "replace") {
		return {
			id: card.id,
			front: parseFlashcardSideHtml(edit.front),
			back: parseFlashcardSideHtml(edit.back),
		};
	}
	if (edit.op === "replace_text") {
		const replaced = replaceUniqueText(
			serializeFlashcardSideToHtml(card[edit.side]),
			edit.find,
			edit.replace,
		);
		if (!replaced.ok) {
			throw new OrderedEntryEditError(replaced.code, replaced.detail);
		}
		return {
			...card,
			[edit.side]: parseFlashcardSideHtml(replaced.text),
		};
	}
	throw new Error("Unsupported flashcard edit.");
}
