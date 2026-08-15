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

/**
 * Parses one HTML fragment the model authored for an entry. `itemLabel` names
 * the item type in errors — "Flashcard", "Quiz".
 *
 * The allowlist is not cosmetic: study viewers render with the full document
 * schema, so an unchecked widget or table really would embed itself inside a
 * card face or an answer row. Rejecting costs the model one retry, which is
 * cheaper than the alternatives — silently dropping the node loses content the
 * model believed it wrote, and coercing it needs a rule per node type.
 */
export function parseEntryRichTextHtml(html: string, itemLabel: string): TiptapDocumentJson {
	const document = parseDocumentAiHtml(html);
	visitRichTextValue(document, itemLabel);
	return document;
}

/**
 * Reads back content this module wrote earlier. Structure still has to hold,
 * but the allowlist is deliberately not re-applied: it guards what the model
 * may author, and re-running it on storage would let one odd entry — written
 * by an older build, or by a later one that allows more — make the whole item
 * unopenable.
 */
export function parseStoredEntryRichText(value: unknown, itemLabel: string): TiptapDocumentJson {
	const projection = coerceTiptapDocumentProjection(value);
	if (projection.warnings.length > 0) {
		throw new Error(`${itemLabel} content contains invalid rich text.`);
	}
	return projection.document;
}

function visitRichTextValue(value: unknown, itemLabel: string) {
	if (Array.isArray(value)) {
		for (const entry of value) visitRichTextValue(entry, itemLabel);
		return;
	}
	if (!isRecord(value)) return;

	if (typeof value.type === "string" && !allowedNodeTypes.has(value.type)) {
		throw new Error(`${itemLabel} content cannot contain ${value.type} nodes.`);
	}
	if (Array.isArray(value.marks)) {
		for (const mark of value.marks) {
			if (!isRecord(mark) || typeof mark.type !== "string" || !allowedMarkTypes.has(mark.type)) {
				throw new Error(`${itemLabel} content contains an unsupported text mark.`);
			}
		}
	}
	if ("content" in value) visitRichTextValue(value.content, itemLabel);
}
