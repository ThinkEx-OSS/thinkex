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

export const FLASHCARD_SET_VERSION = 1;
const flashcardIdSchema = workspaceEntryIdSchema;

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

export function createFlashcardSetFromHtml(cards: Array<{ front: string; back: string }>) {
	if (cards.length === 0) throw new Error("A flashcard set needs at least one card.");
	return {
		version: FLASHCARD_SET_VERSION,
		cards: cards.map((card) => ({
			id: createWorkspaceEntryId("c"),
			front: parseFlashcardSideHtml(card.front),
			back: parseFlashcardSideHtml(card.back),
		})),
	} satisfies FlashcardSetContent;
}

export function parseFlashcardSideHtml(html: string) {
	return parseEntryRichTextHtml(html, "Flashcard");
}

export function parseFlashcardSetContent(content: string | null): FlashcardSetContent {
	if (!content?.trim()) {
		throw new Error("Flashcard content is missing.");
	}

	const value: unknown = JSON.parse(content);
	if (!isRecord(value) || value.version !== FLASHCARD_SET_VERSION || !Array.isArray(value.cards)) {
		throw new Error("Flashcard content has an unsupported format.");
	}
	if (value.cards.length === 0) {
		throw new Error("A flashcard set needs at least one card.");
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

		const front = parseStoredEntryRichText(card.front, "Flashcard");
		const back = parseStoredEntryRichText(card.back, "Flashcard");
		return { id: cardId.data, front, back };
	});

	return { version: FLASHCARD_SET_VERSION, cards };
}

export function stringifyFlashcardSetContent(content: FlashcardSetContent) {
	return `${JSON.stringify(content)}\n`;
}

export async function createFlashcardRevision(card: Flashcard) {
	return (await sha256Base64UrlText(JSON.stringify({ front: card.front, back: card.back }))).slice(
		0,
		6,
	);
}

export function serializeFlashcardSetToHtml(content: FlashcardSetContent): FlashcardHtmlCard[] {
	return content.cards.map((card) => ({
		id: card.id,
		front: serializeTiptapDocumentToHtml(card.front),
		back: serializeTiptapDocumentToHtml(card.back),
	}));
}
