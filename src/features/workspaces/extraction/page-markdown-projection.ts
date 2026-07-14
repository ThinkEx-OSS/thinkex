export interface MarkdownProjectionPage {
	pageNumber: number;
	markdown: string;
}

export function createSingleMarkdownProjectionPage(markdown: string): MarkdownProjectionPage[] {
	const trimmed = markdown.trim();
	return trimmed ? [{ pageNumber: 1, markdown: trimmed }] : [];
}

/** Parses the pre-R2 projection shape during lazy migration only. */
export function parseMarkdownPagesProjection(content: string | null) {
	if (!content?.trim()) {
		return [];
	}

	try {
		const parsed = JSON.parse(content) as unknown;

		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.map(parseMarkdownProjectionPage)
			.filter((page): page is MarkdownProjectionPage => page !== null);
	} catch {
		return [];
	}
}

function parseMarkdownProjectionPage(value: unknown): MarkdownProjectionPage | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const pageNumber =
		getPositiveInteger(record.pageNumber) ??
		getPositiveInteger(record.page) ??
		getPositiveInteger(record.index);
	const markdown = typeof record.markdown === "string" ? record.markdown.trim() : "";

	if (!pageNumber || !markdown) {
		return null;
	}

	return { pageNumber, markdown };
}

function getPositiveInteger(value: unknown) {
	return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
