import {
	getWorkspaceKernelAiPageContext,
	resolveWorkspaceKernelAiPath,
} from "#/features/workspaces/ai/workspace-kernel-ai-common";
import {
	readWorkspaceAiProjectionPages,
	WorkspaceKernelAiPageError,
	type WorkspaceKernelAiReadPages,
} from "#/features/workspaces/ai/workspace-kernel-ai-pdf-pages";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";
import { parseMarkdownPagesProjection } from "#/features/workspaces/extraction/page-markdown-projection";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";

export interface ReadWorkspaceKernelAiItemsInput {
	pages?: string;
	paths: string[];
	userId: string;
	workspaceId: string;
}

export interface WorkspaceKernelAiReadItem {
	content?: string;
	pages?: WorkspaceKernelAiReadPages;
	path: string;
	status: "failed" | "pending" | "ready" | "unsupported";
	type: "document" | "file" | "flashcard" | "quiz";
}

export interface WorkspaceKernelAiReadItemsResult {
	items: WorkspaceKernelAiReadItem[];
	failed: WorkspaceKernelAiReadFailure[];
}

const AI_READ_MARKDOWN_LINES_PER_PAGE = 1000;
const MAX_AI_READ_LINE_LENGTH = 2000;
const TRUNCATED_LINE_SUFFIX = `... (line truncated to ${MAX_AI_READ_LINE_LENGTH} chars)`;

type WorkspaceKernelAiReadFailureCode =
	| "page_range_out_of_range"
	| "path_is_folder"
	| "path_not_absolute"
	| "path_not_found";

interface WorkspaceKernelAiReadFailure {
	code: WorkspaceKernelAiReadFailureCode;
	index: number;
	path: string;
}

export async function readWorkspaceKernelAiItems(
	input: ReadWorkspaceKernelAiItemsInput,
): Promise<WorkspaceKernelAiReadItemsResult> {
	const context = await getWorkspaceKernelAiPageContext({
		access: "read",
		userId: input.userId,
		workspaceId: input.workspaceId,
	});
	const result: WorkspaceKernelAiReadItemsResult = {
		items: [],
		failed: [],
	};

	for (const [index, path] of input.paths.entries()) {
		const resolution = resolveWorkspaceKernelAiPath({
			path,
			tree: context.tree,
		});

		if (resolution.status === "invalid_path") {
			result.failed.push({
				code: resolution.code,
				index,
				path: resolution.path,
			});
			continue;
		}

		if (resolution.status === "root") {
			result.failed.push({
				code: "path_is_folder",
				index,
				path: resolution.path,
			});
			continue;
		}

		if (resolution.status === "not_found") {
			result.failed.push({
				code: "path_not_found",
				index,
				path: resolution.path,
			});
			continue;
		}

		if (resolution.item.type === "folder") {
			result.failed.push({
				code: "path_is_folder",
				index,
				path: resolution.path,
			});
			continue;
		}

		try {
			result.items.push(
				await readWorkspaceKernelAiItem({
					item: resolution.item,
					kernel: context.kernel,
					pages: input.pages,
					path: resolution.path,
				}),
			);
		} catch (error) {
			if (error instanceof WorkspaceKernelAiPageError) {
				result.failed.push({
					code: error.code,
					index,
					path: resolution.path,
				});
				continue;
			}

			throw error;
		}
	}

	return result;
}

async function readWorkspaceKernelAiItem(input: {
	item: WorkspaceItemSummary;
	kernel: WorkspaceKernelClient;
	pages?: string;
	path: string;
}): Promise<WorkspaceKernelAiReadItem> {
	const { item } = input;

	if (item.type === "folder") {
		throw new Error("Folder paths should be handled before item reads.");
	}

	if (item.type === "document") {
		const { content } = await input.kernel.readItem({ itemId: item.id });
		const markdown = serializeTiptapDocumentToMarkdown(parseTiptapDocumentJson(content));
		const page = readWorkspaceAiMarkdownPages(markdown, { pages: input.pages });

		return {
			content: page.content,
			pages: page.pages,
			path: input.path,
			status: "ready",
			type: "document",
		};
	}

	if (item.type === "file") {
		return await readWorkspaceKernelAiFileItem(input);
	}

	return {
		path: input.path,
		status: "unsupported",
		type: item.type,
	};
}

async function readWorkspaceKernelAiFileItem(input: {
	item: WorkspaceItemSummary;
	kernel: WorkspaceKernelClient;
	pages?: string;
	path: string;
}): Promise<WorkspaceKernelAiReadItem> {
	const { item } = input;
	const fileType = resolveWorkspaceFileTypeFromItem(item);

	if (!fileType) {
		return createWorkspaceKernelAiFileStatusItem(input.path, "unsupported");
	}

	if (fileType.aiReadStrategy !== "markdown_extraction") {
		return createWorkspaceKernelAiFileStatusItem(input.path, "unsupported");
	}

	const pagesProjection = await input.kernel.readFileProjection({
		itemId: item.id,
		format: "pages",
	});

	if (
		pagesProjection?.status === "queued" ||
		pagesProjection?.status === "processing" ||
		pagesProjection?.status === "not_started"
	) {
		return createWorkspaceKernelAiFileStatusItem(input.path, "pending");
	}

	if (!pagesProjection) {
		return createWorkspaceKernelAiFileStatusItem(input.path, "pending");
	}

	if (pagesProjection.status !== "ready" || pagesProjection.content === null) {
		return createWorkspaceKernelAiFileStatusItem(input.path, "failed");
	}

	const pageRead = readWorkspaceAiProjectionPages(
		parseMarkdownPagesProjection(pagesProjection.content),
		{
			pages: input.pages,
		},
	);

	return {
		content: pageRead.content,
		pages: pageRead.pages,
		path: input.path,
		status: "ready",
		type: "file",
	};
}

function createWorkspaceKernelAiFileStatusItem(
	path: string,
	status: WorkspaceKernelAiReadItem["status"],
): WorkspaceKernelAiReadItem {
	return {
		path,
		status,
		type: "file",
	};
}

function readWorkspaceAiMarkdownPages(
	content: string,
	input: { pages?: string },
): { content: string; pages: WorkspaceKernelAiReadPages } {
	const lines = content === "" ? [] : content.split(/\r?\n/);
	const totalPages = Math.max(1, Math.ceil(lines.length / AI_READ_MARKDOWN_LINES_PER_PAGE));
	const requested = input.pages?.trim() || "1";
	const selectedPageNumbers = parseWorkspaceAiPageRange(requested, totalPages);

	const selectedLines: string[] = [];

	for (const pageNumber of selectedPageNumbers) {
		const startIndex = (pageNumber - 1) * AI_READ_MARKDOWN_LINES_PER_PAGE;
		const pageLines = lines.slice(startIndex, startIndex + AI_READ_MARKDOWN_LINES_PER_PAGE);

		for (const rawLine of pageLines) {
			const line = truncateWorkspaceAiMarkdownLine(rawLine);
			selectedLines.push(line.value);
		}
	}

	return {
		content: selectedLines.join("\n"),
		pages: {
			requested,
			returned: selectedPageNumbers,
			total: totalPages,
		},
	};
}

function parseWorkspaceAiPageRange(value: string, totalPages: number) {
	const selected = new Set<number>();
	const parts = value.split(",");

	for (const rawPart of parts) {
		const part = rawPart.trim();

		if (!part) {
			continue;
		}

		const rangeMatch = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);

		if (!rangeMatch) {
			throw new WorkspaceKernelAiPageError("page_range_out_of_range");
		}

		const start = Number(rangeMatch[1]);
		const end = Number(rangeMatch[2] ?? rangeMatch[1]);

		if (start < 1 || end < start || end > totalPages) {
			throw new WorkspaceKernelAiPageError("page_range_out_of_range");
		}

		for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
			selected.add(pageNumber);
		}
	}

	if (selected.size === 0) {
		throw new WorkspaceKernelAiPageError("page_range_out_of_range");
	}

	return Array.from(selected).sort((left, right) => left - right);
}

function truncateWorkspaceAiMarkdownLine(line: string) {
	if (line.length <= MAX_AI_READ_LINE_LENGTH) {
		return { truncated: false, value: line };
	}

	return {
		truncated: true,
		value: line.slice(0, MAX_AI_READ_LINE_LENGTH) + TRUNCATED_LINE_SUFFIX,
	};
}
