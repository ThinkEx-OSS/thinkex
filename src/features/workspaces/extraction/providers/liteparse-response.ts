import {
	createSingleMarkdownProjectionPage,
	type MarkdownProjectionPage,
} from "#/features/workspaces/extraction/page-markdown-projection";

export function parseLiteParseMarkdownProjection(payload: unknown): MarkdownProjectionPage[] {
	if (!isRecord(payload) || typeof payload.markdown !== "string") {
		throw new Error("LiteParse returned an invalid response.");
	}

	return createSingleMarkdownProjectionPage(payload.markdown);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
