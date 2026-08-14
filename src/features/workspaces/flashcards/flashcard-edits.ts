import { z } from "zod";

import {
	parseFlashcardSideHtml,
	flashcardSideHtmlSchema,
	type FlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";

const cardIdSchema = z.uuid();
const placementSchema = z
	.object({
		beforeCardId: cardIdSchema.optional(),
		afterCardId: cardIdSchema.optional(),
	})
	.refine((value) => !(value.beforeCardId && value.afterCardId), {
		message: "Choose beforeCardId or afterCardId, not both.",
	});

export const flashcardEditSchema = z.union([
	placementSchema.extend({
		op: z.literal("insert_card"),
		front: flashcardSideHtmlSchema,
		back: flashcardSideHtmlSchema,
	}),
	z
		.object({
			op: z.literal("update_card"),
			cardId: cardIdSchema,
			front: flashcardSideHtmlSchema.optional(),
			back: flashcardSideHtmlSchema.optional(),
		})
		.refine((value) => value.front !== undefined || value.back !== undefined, {
			message: "Provide a new front or back.",
		}),
	placementSchema.extend({
		op: z.literal("move_card"),
		cardId: cardIdSchema,
	}),
	z.object({
		op: z.literal("delete_card"),
		cardId: cardIdSchema,
	}),
]);

export type FlashcardEdit = z.output<typeof flashcardEditSchema>;
export type FlashcardEditFailureCode = "card_not_found" | "invalid_card_content";

export function applyFlashcardEdits(content: FlashcardSetContent, edits: FlashcardEdit[]) {
	const cards = [...content.cards];
	const failed: Array<{ code: FlashcardEditFailureCode; detail?: string; index: number }> = [];
	let applied = 0;

	for (const [index, edit] of edits.entries()) {
		try {
			const before = JSON.stringify(cards);
			if (edit.op === "insert_card") {
				const insertionIndex = getPlacementIndex(cards, edit);
				if (insertionIndex === null) throw new CardNotFoundError();
				cards.splice(insertionIndex, 0, {
					id: crypto.randomUUID(),
					front: parseFlashcardSideHtml(edit.front),
					back: parseFlashcardSideHtml(edit.back),
				});
			} else if (edit.op === "update_card") {
				const cardIndex = cards.findIndex((card) => card.id === edit.cardId);
				if (cardIndex < 0) throw new CardNotFoundError();
				const card = cards[cardIndex]!;
				cards[cardIndex] = {
					...card,
					...(edit.front === undefined ? {} : { front: parseFlashcardSideHtml(edit.front) }),
					...(edit.back === undefined ? {} : { back: parseFlashcardSideHtml(edit.back) }),
				};
			} else if (edit.op === "delete_card") {
				const cardIndex = cards.findIndex((card) => card.id === edit.cardId);
				if (cardIndex < 0) throw new CardNotFoundError();
				if (cards.length === 1) throw new Error("A flashcard set needs at least one card.");
				cards.splice(cardIndex, 1);
			} else {
				const cardIndex = cards.findIndex((card) => card.id === edit.cardId);
				if (cardIndex < 0) throw new CardNotFoundError();
				const targetId = edit.beforeCardId ?? edit.afterCardId;
				if (targetId === edit.cardId || (targetId && !cards.some((card) => card.id === targetId))) {
					throw new CardNotFoundError();
				}
				const [card] = cards.splice(cardIndex, 1);
				const insertionIndex = getPlacementIndex(cards, edit);
				if (!card || insertionIndex === null) throw new CardNotFoundError();
				cards.splice(insertionIndex, 0, card);
			}
			if (JSON.stringify(cards) !== before) applied += 1;
		} catch (error) {
			failed.push({
				code: error instanceof CardNotFoundError ? "card_not_found" : "invalid_card_content",
				...(error instanceof Error && error.message ? { detail: error.message } : {}),
				index,
			});
		}
	}

	return { applied, failed, content: { ...content, cards } };
}

function getPlacementIndex(
	cards: FlashcardSetContent["cards"],
	placement: { beforeCardId?: string; afterCardId?: string },
) {
	const targetId = placement.beforeCardId ?? placement.afterCardId;
	if (!targetId) return cards.length;
	const targetIndex = cards.findIndex((card) => card.id === targetId);
	if (targetIndex < 0) return null;
	return placement.beforeCardId ? targetIndex : targetIndex + 1;
}

class CardNotFoundError extends Error {}
