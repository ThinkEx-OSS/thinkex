import type { TextSerializer } from "@tiptap/core";
import { getText, getTextSerializersFromSchema } from "@tiptap/core";

import type { JsonValue, WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

export const WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY = "previewText";
export const WORKSPACE_DOCUMENT_PREVIEW_MAX_LINES = 11;
export const WORKSPACE_DOCUMENT_PREVIEW_TEXT_MAX_LENGTH = 500;

const documentPreviewTextSerializers: Record<string, TextSerializer> = {
	blockMath: ({ node }) => getMathLatex(node.attrs.latex),
	inlineMath: ({ node }) => getMathLatex(node.attrs.latex),
};

export function getWorkspaceDocumentPreviewText(item: Pick<WorkspaceItemSummary, "metadataJson">) {
	const previewText = item.metadataJson[WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY];

	return typeof previewText === "string" ? previewText.trim() : "";
}

export function extractDocumentPreviewText(content: string | null): string {
	if (!content?.trim()) {
		return "";
	}

	try {
		const document = parseTiptapDocumentJson(content);
		const schema = getTiptapDocumentSchema();
		const node = schema.nodeFromJSON(document);
		const text = normalizeDocumentPreviewText(
			getText(node, {
				blockSeparator: "\n",
				textSerializers: {
					...getTextSerializersFromSchema(schema),
					...documentPreviewTextSerializers,
				},
			}),
		);

		if (!text) {
			return "";
		}

		return truncateDocumentPreviewText(text);
	} catch {
		return "";
	}
}

export function withDocumentPreviewMetadata(
	metadataJson: Record<string, JsonValue>,
	content: string,
): Record<string, JsonValue> {
	const previewText = extractDocumentPreviewText(content);

	if (!previewText) {
		const { [WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY]: _removed, ...rest } = metadataJson;
		return rest;
	}

	return {
		...metadataJson,
		[WORKSPACE_DOCUMENT_PREVIEW_TEXT_METADATA_KEY]: previewText,
	};
}

function getMathLatex(value: unknown) {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeDocumentPreviewText(text: string) {
	return text
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.replace(/[\t ]+/g, " ").trim())
		.filter((line) => line.length > 0)
		.join("\n")
		.trim();
}

function truncateDocumentPreviewText(text: string) {
	const lines = text.split("\n");
	const lineLimited =
		lines.length <= WORKSPACE_DOCUMENT_PREVIEW_MAX_LINES
			? text
			: `${lines.slice(0, WORKSPACE_DOCUMENT_PREVIEW_MAX_LINES).join("\n").trimEnd()}…`;

	if (lineLimited.length <= WORKSPACE_DOCUMENT_PREVIEW_TEXT_MAX_LENGTH) {
		return lineLimited;
	}

	const truncated = lineLimited.slice(0, WORKSPACE_DOCUMENT_PREVIEW_TEXT_MAX_LENGTH);
	const lastNewline = truncated.lastIndexOf("\n");

	if (lastNewline > WORKSPACE_DOCUMENT_PREVIEW_TEXT_MAX_LENGTH * 0.6) {
		return `${truncated.slice(0, lastNewline).trimEnd()}…`;
	}

	return `${truncated.trimEnd()}…`;
}
