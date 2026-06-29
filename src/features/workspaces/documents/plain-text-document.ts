import type { JsonValue } from "#/features/workspaces/contracts";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";

export function plainTextToTiptapDocument(text: string): TiptapDocumentJson {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");

	return {
		type: "doc",
		content: lines.map(plainTextLineToTiptapParagraph),
	};
}

function plainTextLineToTiptapParagraph(line: string): JsonValue {
	if (!line) {
		return { type: "paragraph" };
	}

	return {
		type: "paragraph",
		content: [{ type: "text", text: line }],
	};
}
