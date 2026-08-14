import { z } from "zod";

import {
	replaceUniqueText,
	type ReplaceUniqueTextFailureCode,
} from "#/features/workspaces/content/replace-unique-text";
import {
	createFlashcardRevision,
	flashcardSideHtmlSchema,
	parseFlashcardSideHtml,
	serializeFlashcardSideToHtml,
	type FlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";
import { workspaceReferenceInputSchema } from "#/features/workspaces/locations/workspace-location";

const editTextSchema = z.string().max(8_000);

export const flashcardEditSchema = z.union([
	z.strictObject({
		op: z.enum(["insert_before", "insert_after"]),
		ref: workspaceReferenceInputSchema,
		front: flashcardSideHtmlSchema,
		back: flashcardSideHtmlSchema,
	}),
	z
		.strictObject({
			op: z.literal("update"),
			ref: workspaceReferenceInputSchema,
			front: flashcardSideHtmlSchema.optional(),
			back: flashcardSideHtmlSchema.optional(),
		})
		.refine((value) => value.front !== undefined || value.back !== undefined, {
			message: "Provide a new front or back.",
		}),
	z.strictObject({
		op: z.literal("replace"),
		ref: workspaceReferenceInputSchema,
		front: flashcardSideHtmlSchema,
		back: flashcardSideHtmlSchema,
	}),
	z.strictObject({
		op: z.literal("replace_text"),
		ref: workspaceReferenceInputSchema,
		side: z.enum(["front", "back"]),
		find: editTextSchema
			.min(1)
			.describe("Exact HTML text from the selected side. It must appear exactly once."),
		replace: editTextSchema.describe("Replacement text. May be empty."),
	}),
	z
		.strictObject({
			op: z.literal("move"),
			ref: workspaceReferenceInputSchema,
			beforeRef: workspaceReferenceInputSchema.optional(),
			afterRef: workspaceReferenceInputSchema.optional(),
		})
		.refine((edit) => Boolean(edit.beforeRef) !== Boolean(edit.afterRef), {
			message: "Provide exactly one of beforeRef or afterRef.",
		}),
	z.strictObject({
		op: z.literal("delete"),
		ref: workspaceReferenceInputSchema,
	}),
]);

export type FlashcardEdit = z.output<typeof flashcardEditSchema>;
export type FlashcardEditTarget = { cardId: string; revision: string };
export type FlashcardEditFailureCode =
	| "cannot_delete_last_card"
	| "ref_not_found"
	| "ref_stale"
	| "invalid_card_content"
	| "no_change"
	| ReplaceUniqueTextFailureCode;

export async function applyFlashcardEdits(
	content: FlashcardSetContent,
	edits: FlashcardEdit[],
	targets: ReadonlyMap<string, FlashcardEditTarget>,
) {
	const cards = [...content.cards];
	const initialRevisions = new Map(
		await Promise.all(
			cards.map(async (card) => [card.id, await createFlashcardRevision(card)] as const),
		),
	);
	const failed: Array<{ code: FlashcardEditFailureCode; detail?: string; index: number }> = [];
	let applied = 0;

	for (const [index, edit] of edits.entries()) {
		try {
			const before = JSON.stringify(cards);
			const cardIndex = findCardIndex(cards, edit.ref, targets, initialRevisions);
			if (edit.op === "insert_before" || edit.op === "insert_after") {
				const insertionIndex = edit.op === "insert_before" ? cardIndex : cardIndex + 1;
				cards.splice(insertionIndex, 0, {
					id: crypto.randomUUID(),
					front: parseFlashcardSideHtml(edit.front),
					back: parseFlashcardSideHtml(edit.back),
				});
			} else if (edit.op === "update") {
				const card = cards[cardIndex]!;
				cards[cardIndex] = {
					...card,
					...(edit.front === undefined ? {} : { front: parseFlashcardSideHtml(edit.front) }),
					...(edit.back === undefined ? {} : { back: parseFlashcardSideHtml(edit.back) }),
				};
			} else if (edit.op === "replace") {
				cards[cardIndex] = {
					id: cards[cardIndex]!.id,
					front: parseFlashcardSideHtml(edit.front),
					back: parseFlashcardSideHtml(edit.back),
				};
			} else if (edit.op === "replace_text") {
				const card = cards[cardIndex]!;
				const replaced = replaceUniqueText(
					serializeFlashcardSideToHtml(card[edit.side]),
					edit.find,
					edit.replace,
				);
				if (!replaced.ok) {
					throw new FlashcardEditError(replaced.code, replaced.detail);
				}
				cards[cardIndex] = {
					...card,
					[edit.side]: parseFlashcardSideHtml(replaced.text),
				};
			} else if (edit.op === "delete") {
				if (cards.length === 1) {
					throw new FlashcardEditError(
						"cannot_delete_last_card",
						"A flashcard set needs at least one card.",
					);
				}
				cards.splice(cardIndex, 1);
			} else if (edit.op === "move") {
				const destinationRef = edit.beforeRef ?? edit.afterRef;
				if (!destinationRef || destinationRef === edit.ref) {
					throw new FlashcardEditError("no_change");
				}
				findCardIndex(cards, destinationRef, targets, initialRevisions);
				const [card] = cards.splice(cardIndex, 1);
				const destinationIndex = findCardIndex(cards, destinationRef, targets, initialRevisions);
				if (!card) throw new FlashcardEditError("ref_not_found");
				cards.splice(edit.beforeRef ? destinationIndex : destinationIndex + 1, 0, card);
			} else {
				throw new Error("Unsupported flashcard edit.");
			}
			if (JSON.stringify(cards) === before) throw new FlashcardEditError("no_change");
			applied += 1;
		} catch (error) {
			failed.push({
				code: error instanceof FlashcardEditError ? error.code : "invalid_card_content",
				...(error instanceof Error && error.message ? { detail: error.message } : {}),
				index,
			});
		}
	}

	return { applied, failed, content: { ...content, cards } };
}

function findCardIndex(
	cards: FlashcardSetContent["cards"],
	ref: string,
	targets: ReadonlyMap<string, FlashcardEditTarget>,
	initialRevisions: ReadonlyMap<string, string>,
) {
	const target = targets.get(ref);
	if (!target) throw new FlashcardEditError("ref_not_found");
	const index = cards.findIndex((card) => card.id === target.cardId);
	if (index < 0) throw new FlashcardEditError("ref_not_found");
	if (initialRevisions.get(target.cardId) !== target.revision) {
		throw new FlashcardEditError("ref_stale");
	}
	return index;
}

class FlashcardEditError extends Error {
	constructor(
		readonly code: Exclude<FlashcardEditFailureCode, "invalid_card_content">,
		message?: string,
	) {
		super(message);
	}
}
