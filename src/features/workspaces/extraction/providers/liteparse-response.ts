import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";

export function parseLiteParsePage(payload: unknown): MarkdownProjectionPage {
	if (
		!isRecord(payload) ||
		typeof payload.pageNumber !== "number" ||
		!Number.isInteger(payload.pageNumber) ||
		payload.pageNumber < 1 ||
		typeof payload.markdown !== "string"
	) {
		throw new Error("LiteParse returned an invalid page.");
	}

	return { pageNumber: payload.pageNumber, markdown: payload.markdown.trim() };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
