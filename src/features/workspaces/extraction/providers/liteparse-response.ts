import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";

export function parseLiteParsePages(payload: unknown): MarkdownProjectionPage[] {
	if (!isRecord(payload) || !Array.isArray(payload.pages)) {
		throw new Error("LiteParse returned an invalid response.");
	}

	return payload.pages.map((page) => {
		if (
			!isRecord(page) ||
			typeof page.pageNumber !== "number" ||
			!Number.isInteger(page.pageNumber) ||
			page.pageNumber < 1 ||
			typeof page.markdown !== "string"
		) {
			throw new Error("LiteParse returned an invalid page.");
		}

		return { pageNumber: page.pageNumber, markdown: page.markdown.trim() };
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
