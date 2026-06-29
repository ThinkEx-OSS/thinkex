import type { JSONContent } from "@tiptap/core";
import { Markdown, MarkdownManager } from "@tiptap/markdown";

import {
	coerceTiptapDocumentProjection,
	type TiptapDocumentJson,
	type TiptapDocumentProjection,
} from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentSchemaExtensions } from "#/features/workspaces/documents/tiptap-schema";

let documentMarkdownManager: MarkdownManager | null = null;

export function serializeTiptapDocumentToMarkdown(document: TiptapDocumentJson) {
	return getDocumentMarkdownManager()
		.serialize(document as JSONContent)
		.trimEnd();
}

export function parseMarkdownToTiptapDocumentProjection(
	markdown: string,
): TiptapDocumentProjection {
	return coerceTiptapDocumentProjection(getDocumentMarkdownManager().parse(markdown));
}

function getDocumentMarkdownManager() {
	documentMarkdownManager ??= new MarkdownManager({
		extensions: [...getTiptapDocumentSchemaExtensions(), Markdown],
	});

	return documentMarkdownManager;
}
