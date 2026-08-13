import type { JsonValue } from "#/features/workspaces/contracts";
import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import {
	publishWorkspaceFilePages,
	readWorkspaceFilePages,
} from "#/features/workspaces/persistence/workspace-files";
import {
	parseWorkspacePageRange,
	WorkspacePageSelectionError,
	type WorkspaceReadPages,
} from "#/features/workspaces/read-page-selection";

const maxPageMarkdownBytes = 1024 * 1024;
const maxPageReadBytes = 2 * 1024 * 1024;
const maxProjectionMarkdownBytes = 16 * 1024 * 1024;

export async function publishWorkspacePageProjection(input: {
	actorUserId?: string | null;
	itemId: string;
	metadata?: Record<string, JsonValue>;
	pages: AsyncIterable<MarkdownProjectionPage> | Iterable<MarkdownProjectionPage>;
	provider: string;
	providerMode: string;
	sourceHash: string;
	tier: "enhanced" | "fast";
	workspaceId: string;
}) {
	const projection = await materializeWorkspacePageProjection(input.pages);
	const status = await publishWorkspaceFilePages({
		itemId: input.itemId,
		pages: projection.pages,
		provider: input.provider,
		providerMode: input.providerMode,
		sourceHash: input.sourceHash,
		tier: input.tier,
		workspaceId: input.workspaceId,
		metadataJson: input.metadata,
		actorUserId: input.actorUserId,
	});

	return {
		status,
		pageCount: projection.pageCount,
		markdownLength: projection.markdownLength,
	};
}

export async function readWorkspacePageProjection(input: {
	itemId: string;
	pageCount: number;
	pages?: string;
	workspaceId: string;
}): Promise<{ content: string; emptyPages: number[]; pages: WorkspaceReadPages }> {
	const requested = input.pages?.trim() || "1";
	const selectedPageNumbers = parseWorkspacePageRange(requested, input.pageCount);
	const pages = await readWorkspaceFilePages({
		itemId: input.itemId,
		pageNumbers: selectedPageNumbers,
		workspaceId: input.workspaceId,
	});
	if (
		pages.length !== selectedPageNumbers.length ||
		pages.some((page, index) => page.pageNumber !== selectedPageNumbers[index])
	) {
		throw new Error("Workspace page projection is incomplete.");
	}
	if (pages.reduce((total, page) => total + page.markdownBytes, 0) > maxPageReadBytes) {
		throw new WorkspacePageSelectionError("page_selection_too_large");
	}

	return {
		content: pages.map(formatProjectionPage).join("\n\n"),
		emptyPages: pages.filter((page) => page.markdown.length === 0).map((page) => page.pageNumber),
		pages: {
			requested,
			returned: selectedPageNumbers,
			total: input.pageCount,
		},
	};
}

async function materializeWorkspacePageProjection(
	input: AsyncIterable<MarkdownProjectionPage> | Iterable<MarkdownProjectionPage>,
) {
	const encoder = new TextEncoder();
	const pages: Array<MarkdownProjectionPage & { markdownBytes: number }> = [];
	let lastPageNumber = 0;
	let markdownBytes = 0;
	let markdownLength = 0;
	let usablePageCount = 0;

	for await (const rawPage of input) {
		const page = normalizeProjectionPage(rawPage);
		if (page.pageNumber <= lastPageNumber) {
			throw new Error("Extracted pages must be ordered by unique, increasing page number.");
		}
		for (let pageNumber = lastPageNumber + 1; pageNumber < page.pageNumber; pageNumber += 1) {
			pages.push({ markdown: "", markdownBytes: 0, pageNumber });
		}

		const pageBytes = encoder.encode(page.markdown).byteLength;
		if (pageBytes > maxPageMarkdownBytes) {
			throw new Error(`Extracted page ${page.pageNumber} exceeds the page size limit.`);
		}
		if (markdownBytes + pageBytes > maxProjectionMarkdownBytes) {
			throw new Error("Extracted document exceeds the projection size limit.");
		}

		pages.push({ ...page, markdownBytes: pageBytes });
		lastPageNumber = page.pageNumber;
		markdownBytes += pageBytes;
		markdownLength += page.markdown.length;
		if (page.markdown.length > 0) usablePageCount += 1;
	}

	if (lastPageNumber === 0 || usablePageCount === 0) {
		throw new Error("Extraction did not produce usable page Markdown.");
	}

	return { markdownBytes, markdownLength, pageCount: pages.length, pages };
}

function normalizeProjectionPage(page: MarkdownProjectionPage): MarkdownProjectionPage {
	if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1) {
		throw new Error("Extracted page number is invalid.");
	}
	if (typeof page.markdown !== "string") {
		throw new Error("Extracted page Markdown is invalid.");
	}
	return page;
}

function formatProjectionPage(page: { markdown: string; pageNumber: number }) {
	return page.markdown
		? `## Page ${page.pageNumber}\n\n${page.markdown}`
		: `## Page ${page.pageNumber}`;
}
