import {
	getWorkspaceOperationContext,
	resolveWorkspaceOperationPath,
} from "#/features/workspaces/operations/workspace-operation-context";
import {
	serializeWorkspaceRelations,
	type WorkspaceRelationOutput,
} from "#/features/workspaces/operations/relations";
import {
	parseWorkspacePageRange,
	readWorkspaceProjectionPages,
	WorkspacePageSelectionError,
	type WorkspaceReadPages,
} from "#/features/workspaces/operations/read-page-selection";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";
import { parseMarkdownPagesProjection } from "#/features/workspaces/extraction/page-markdown-projection";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import { buildWorkspaceKernelItemPathIndex } from "#/features/workspaces/kernel/workspace-kernel-paths";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

export interface ReadWorkspaceItemsOperationInput {
	pages?: string;
	paths: string[];
}

export interface WorkspaceReadItem {
	content?: string;
	pages?: WorkspaceReadPages;
	path: string;
	relations?: WorkspaceRelationOutput[];
	status: "failed" | "pending" | "ready" | "unsupported";
	type: "document" | "file" | "flashcard" | "quiz";
}

export interface WorkspaceReadItemsResult {
	items: WorkspaceReadItem[];
	failed: WorkspaceReadItemsFailure[];
}

const WORKSPACE_READ_MARKDOWN_LINES_PER_PAGE = 1000;
const MAX_WORKSPACE_READ_LINE_LENGTH = 2000;
const TRUNCATED_LINE_SUFFIX = `... (line truncated to ${MAX_WORKSPACE_READ_LINE_LENGTH} chars)`;

export const readWorkspaceItemsFailureCodes = [
	"page_range_out_of_range",
	"path_is_folder",
	"path_not_absolute",
	"path_not_found",
] as const;

type WorkspaceReadItemsFailureCode = (typeof readWorkspaceItemsFailureCodes)[number];

interface WorkspaceReadItemsFailure {
	code: WorkspaceReadItemsFailureCode;
	index: number;
	path: string;
}

export async function readWorkspaceItemsOperation(
	accessContext: WorkspaceAccessContext,
	input: ReadWorkspaceItemsOperationInput,
): Promise<WorkspaceReadItemsResult> {
	const workspaceContext = await getWorkspaceOperationContext({
		access: "read",
		context: accessContext,
	});
	const result: WorkspaceReadItemsResult = {
		items: [],
		failed: [],
	};
	const pathsByItemId = buildWorkspaceKernelItemPathIndex(workspaceContext.pageItems);

	for (const [index, path] of input.paths.entries()) {
		const resolution = resolveWorkspaceOperationPath({
			path,
			tree: workspaceContext.tree,
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
			const item = await readWorkspaceItem({
				item: resolution.item,
				kernel: workspaceContext.kernel,
				pages: input.pages,
				path: resolution.path,
			});
			const relations = serializeWorkspaceRelations({
				item: resolution.item,
				pathsByItemId,
				relations: await workspaceContext.kernel.listItemRelations({
					itemId: resolution.item.id,
				}),
			});

			result.items.push({
				...item,
				...(relations.length > 0 ? { relations } : {}),
			});
		} catch (error) {
			if (error instanceof WorkspacePageSelectionError) {
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

async function readWorkspaceItem(input: {
	item: WorkspaceItemSummary;
	kernel: WorkspaceKernelClient;
	pages?: string;
	path: string;
}): Promise<WorkspaceReadItem> {
	const { item } = input;

	if (item.type === "folder") {
		throw new Error("Folder paths should be handled before item reads.");
	}

	if (item.type === "document") {
		const { content } = await input.kernel.readItem({ itemId: item.id });
		const markdown = serializeTiptapDocumentToMarkdown(parseTiptapDocumentJson(content));
		const page = readWorkspaceMarkdownPages(markdown, { pages: input.pages });

		return {
			content: page.content,
			pages: page.pages,
			path: input.path,
			status: "ready",
			type: "document",
		};
	}

	if (item.type === "file") {
		return await readWorkspaceFileItem(input);
	}

	return {
		path: input.path,
		status: "unsupported",
		type: item.type,
	};
}

async function readWorkspaceFileItem(input: {
	item: WorkspaceItemSummary;
	kernel: WorkspaceKernelClient;
	pages?: string;
	path: string;
}): Promise<WorkspaceReadItem> {
	const { item } = input;
	const fileType = resolveWorkspaceFileTypeFromItem(item);

	if (!fileType) {
		return createWorkspaceFileStatusItem(input.path, "unsupported");
	}

	if (fileType.aiReadStrategy !== "markdown_extraction") {
		return createWorkspaceFileStatusItem(input.path, "unsupported");
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
		return createWorkspaceFileStatusItem(input.path, "pending");
	}

	if (!pagesProjection) {
		return createWorkspaceFileStatusItem(input.path, "pending");
	}

	if (pagesProjection.status !== "ready" || pagesProjection.content === null) {
		return createWorkspaceFileStatusItem(input.path, "failed");
	}

	const pageRead = readWorkspaceProjectionPages(
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

function createWorkspaceFileStatusItem(
	path: string,
	status: WorkspaceReadItem["status"],
): WorkspaceReadItem {
	return {
		path,
		status,
		type: "file",
	};
}

function readWorkspaceMarkdownPages(
	content: string,
	input: { pages?: string },
): { content: string; pages: WorkspaceReadPages } {
	const lines = content === "" ? [] : content.split(/\r?\n/);
	const totalPages = Math.max(1, Math.ceil(lines.length / WORKSPACE_READ_MARKDOWN_LINES_PER_PAGE));
	const requested = input.pages?.trim() || "1";
	const selectedPageNumbers = parseWorkspacePageRange(requested, totalPages);

	const selectedLines: string[] = [];

	for (const pageNumber of selectedPageNumbers) {
		const startIndex = (pageNumber - 1) * WORKSPACE_READ_MARKDOWN_LINES_PER_PAGE;
		const pageLines = lines.slice(startIndex, startIndex + WORKSPACE_READ_MARKDOWN_LINES_PER_PAGE);

		for (const rawLine of pageLines) {
			const line = truncateWorkspaceMarkdownLine(rawLine);
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

function truncateWorkspaceMarkdownLine(line: string) {
	if (line.length <= MAX_WORKSPACE_READ_LINE_LENGTH) {
		return { truncated: false, value: line };
	}

	return {
		truncated: true,
		value: line.slice(0, MAX_WORKSPACE_READ_LINE_LENGTH) + TRUNCATED_LINE_SUFFIX,
	};
}
