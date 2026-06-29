export interface MarkdownProjectionPage {
	pageNumber: number;
	markdown: string;
}

export function createSingleMarkdownProjectionPage(markdown: string): MarkdownProjectionPage[] {
	const trimmed = markdown.trim();
	return trimmed ? [{ pageNumber: 1, markdown: trimmed }] : [];
}

export function serializeMarkdownPagesProjection(pages: readonly MarkdownProjectionPage[]) {
	return JSON.stringify(
		pages
			.map((page) => ({
				pageNumber: page.pageNumber,
				markdown: page.markdown.trim(),
			}))
			.filter((page) => Number.isInteger(page.pageNumber) && page.pageNumber > 0 && page.markdown),
	);
}

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

export function joinMarkdownProjectionPages(pages: readonly MarkdownProjectionPage[]) {
	return pages
		.map((page) => `## Page ${page.pageNumber}\n\n${page.markdown}`)
		.join("\n\n")
		.trim();
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
