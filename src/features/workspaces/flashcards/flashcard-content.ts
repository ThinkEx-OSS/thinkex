import { z } from "zod";

import {
	parseDocumentAiHtml,
	serializeTiptapDocumentToHtml,
} from "#/features/workspaces/documents/document-ai-html";
import {
	coerceTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { isRecord } from "#/lib/record";

export const FLASHCARD_SET_VERSION = 1;
export const flashcardSideHtmlSchema = z.string().trim().min(1).max(8_000);
const flashcardIdSchema = z.uuid();

export interface Flashcard {
	id: string;
	front: TiptapDocumentJson;
	back: TiptapDocumentJson;
}

export interface FlashcardSetContent {
	version: typeof FLASHCARD_SET_VERSION;
	cards: Flashcard[];
}

interface FlashcardHtmlCard {
	id: string;
	front: string;
	back: string;
}

const allowedNodeTypes = new Set([
	"doc",
	"paragraph",
	"text",
	"bulletList",
	"orderedList",
	"listItem",
	"codeBlock",
	"hardBreak",
	"inlineMath",
	"blockMath",
]);

const allowedMarkTypes = new Set(["bold", "italic", "strike", "code", "link", "underline"]);

export function createFlashcardSetFromHtml(cards: Array<{ front: string; back: string }>) {
	if (cards.length === 0) throw new Error("A flashcard set needs at least one card.");
	return {
		version: FLASHCARD_SET_VERSION,
		cards: cards.map((card) => ({
			id: crypto.randomUUID(),
			front: parseFlashcardSideHtml(card.front),
			back: parseFlashcardSideHtml(card.back),
		})),
	} satisfies FlashcardSetContent;
}

export function parseFlashcardSideHtml(html: string) {
	const document = parseDocumentAiHtml(html);
	assertFlashcardRichText(document);
	return document;
}

export function parseFlashcardSetContent(content: string | null): FlashcardSetContent {
	if (!content?.trim()) {
		throw new Error("Flashcard content is missing.");
	}

	const value: unknown = JSON.parse(content);
	if (!isRecord(value) || value.version !== FLASHCARD_SET_VERSION || !Array.isArray(value.cards)) {
		throw new Error("Flashcard content has an unsupported format.");
	}

	const seenIds = new Set<string>();
	const cards = value.cards.map((card) => {
		if (!isRecord(card)) {
			throw new Error("Flashcard content contains an invalid card ID.");
		}
		const cardId = flashcardIdSchema.safeParse(card.id);
		if (!cardId.success) {
			throw new Error("Flashcard content contains an invalid card ID.");
		}
		if (seenIds.has(cardId.data)) {
			throw new Error("Flashcard content contains a duplicate card ID.");
		}
		seenIds.add(cardId.data);

		const front = coerceTiptapDocumentJson(card.front);
		const back = coerceTiptapDocumentJson(card.back);
		assertFlashcardRichText(front);
		assertFlashcardRichText(back);
		return { id: cardId.data, front, back };
	});

	return { version: FLASHCARD_SET_VERSION, cards };
}

export function stringifyFlashcardSetContent(content: FlashcardSetContent) {
	return `${JSON.stringify(content)}\n`;
}

export function serializeFlashcardSetToHtml(content: FlashcardSetContent): FlashcardHtmlCard[] {
	return content.cards.map((card) => ({
		id: card.id,
		front: serializeTiptapDocumentToHtml(card.front),
		back: serializeTiptapDocumentToHtml(card.back),
	}));
}

function assertFlashcardRichText(value: unknown) {
	visitRichTextValue(value);
}

function visitRichTextValue(value: unknown) {
	if (Array.isArray(value)) {
		for (const entry of value) visitRichTextValue(entry);
		return;
	}
	if (!isRecord(value)) return;

	if (typeof value.type === "string" && !allowedNodeTypes.has(value.type)) {
		throw new Error(`Flashcards do not support ${value.type} content yet.`);
	}
	if (Array.isArray(value.marks)) {
		for (const mark of value.marks) {
			if (!isRecord(mark) || typeof mark.type !== "string" || !allowedMarkTypes.has(mark.type)) {
				throw new Error("Flashcard content contains an unsupported text mark.");
			}
		}
	}
	if ("content" in value) visitRichTextValue(value.content);
}
