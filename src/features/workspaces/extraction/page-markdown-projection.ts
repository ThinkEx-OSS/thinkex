export interface MarkdownProjectionPage {
	pageNumber: number;
	markdown: string;
}

export function createSingleMarkdownProjectionPage(markdown: string): MarkdownProjectionPage[] {
	const trimmed = markdown.trim();
	return trimmed ? [{ pageNumber: 1, markdown: trimmed }] : [];
}
