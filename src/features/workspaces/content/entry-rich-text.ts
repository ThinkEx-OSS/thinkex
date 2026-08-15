import { z } from "zod";

import { parseDocumentAiHtml } from "#/features/workspaces/documents/document-ai-html";
import {
	coerceTiptapDocumentProjection,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { isRecord } from "#/lib/record";

/**
 * Rich text for entries inside structured items: flashcard sides and quiz
 * stems, options, and explanations. Deliberately smaller than a document —
 * no headings, tables, images, widgets, task lists, or citations.
 */
export const entryRichTextHtmlSchema = z.string().trim().min(1).max(8_000);

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

interface EntryRichTextMessages {
	/** e.g. "Flashcards do not support heading content yet." */
	unsupportedNode: (nodeType: string) => string;
	unsupportedMark: string;
	invalidStored: string;
}

/**
 * One parser per item type so validation failures name the item the model
 * (or a stored blob) actually violated.
 */
export function createEntryRichTextParser(messages: EntryRichTextMessages) {
	function assertEntryRichText(value: unknown) {
		visitRichTextValue(value, messages);
	}

	return {
		parseEntryRichTextHtml(html: string): TiptapDocumentJson {
			const document = parseDocumentAiHtml(html);
			assertEntryRichText(document);
			return document;
		},
		parseStoredEntryRichText(value: unknown): TiptapDocumentJson {
			const projection = coerceTiptapDocumentProjection(value);
			if (projection.warnings.length > 0) {
				throw new Error(messages.invalidStored);
			}
			assertEntryRichText(projection.document);
			return projection.document;
		},
	};
}

function visitRichTextValue(value: unknown, messages: EntryRichTextMessages) {
	if (Array.isArray(value)) {
		for (const entry of value) visitRichTextValue(entry, messages);
		return;
	}
	if (!isRecord(value)) return;

	if (typeof value.type === "string" && !allowedNodeTypes.has(value.type)) {
		throw new Error(messages.unsupportedNode(value.type));
	}
	if (Array.isArray(value.marks)) {
		for (const mark of value.marks) {
			if (!isRecord(mark) || typeof mark.type !== "string" || !allowedMarkTypes.has(mark.type)) {
				throw new Error(messages.unsupportedMark);
			}
		}
	}
	if ("content" in value) visitRichTextValue(value.content, messages);
}
