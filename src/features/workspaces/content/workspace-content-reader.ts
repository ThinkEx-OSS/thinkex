import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type {
	WorkspaceContentReadRequest,
	WorkspaceContentReadResult,
} from "#/features/workspaces/content/workspace-content-contract";
import type { DocumentSessionClient } from "#/features/workspaces/document-session-access";
import { readWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import { serializeWorkspaceRelations } from "#/features/workspaces/operations/relations";
import { WorkspacePageSelectionError } from "#/features/workspaces/read-page-selection";
import {
	decodeWorkspaceContentCursor,
	encodeWorkspaceContentCursor,
} from "#/features/workspaces/content/workspace-content-cursor";

const maxDocumentChunkCharacters = 64_000;

interface PendingReadyResult {
	item: WorkspaceItemSummary;
	read: Extract<WorkspaceContentReadResult, { status: "ready" }>;
	relations: Awaited<ReturnType<WorkspaceKernelClient["listItemRelations"]>>;
}

export interface WorkspaceContentReader {
	read(requests: WorkspaceContentReadRequest[]): Promise<WorkspaceContentReadResult[]>;
}

export function createWorkspaceContentReader(input: {
	bucket: R2Bucket;
	getDocumentSession: (itemId: string) => DocumentSessionClient;
	kernel: WorkspaceKernelClient;
}): WorkspaceContentReader {
	return {
		async read(requests) {
			const resolutions = await input.kernel.resolvePaths({
				paths: requests.map((request) => request.path),
			});
			const results: WorkspaceContentReadResult[] = [];
			const readyResults: PendingReadyResult[] = [];

			for (const [index, resolution] of resolutions.entries()) {
				const request = requests[index];
				if (!request) {
					throw new Error("Workspace content resolution did not match its request.");
				}
				if (resolution.status === "invalid_path") {
					results.push({ code: resolution.code, path: resolution.path, status: "failed" });
					continue;
				}
				if (resolution.status === "root") {
					results.push({ code: "path_is_folder", path: resolution.path, status: "failed" });
					continue;
				}
				if (resolution.status === "not_found") {
					results.push({ code: "path_not_found", path: resolution.path, status: "failed" });
					continue;
				}
				if (resolution.item.type === "folder") {
					results.push({ code: "path_is_folder", path: resolution.path, status: "failed" });
					continue;
				}

				try {
					const read = await readWorkspaceItem({
						...input,
						item: resolution.item,
						request,
						path: resolution.path,
					});
					if (read.status !== "ready") {
						results.push(read);
						continue;
					}

					const pending = {
						item: resolution.item,
						read,
						relations: await input.kernel.listItemRelations({ itemId: resolution.item.id }),
					};
					readyResults.push(pending);
					results.push(read);
				} catch (error) {
					if (error instanceof WorkspacePageSelectionError) {
						results.push({ code: error.code, path: resolution.path, status: "failed" });
						continue;
					}
					throw error;
				}
			}

			await attachRelationPaths(input.kernel, readyResults);
			return results;
		},
	};
}

async function readWorkspaceItem(input: {
	bucket: R2Bucket;
	getDocumentSession: (itemId: string) => DocumentSessionClient;
	item: WorkspaceItemSummary;
	kernel: WorkspaceKernelClient;
	path: string;
	request: WorkspaceContentReadRequest;
}): Promise<WorkspaceContentReadResult> {
	if (input.item.type === "document") {
		return await readDocument(input);
	}
	if (input.item.type === "file") {
		return await readFile(input);
	}
	return { code: "unsupported_item_type", path: input.path, status: "failed" };
}

async function readDocument(input: {
	getDocumentSession: (itemId: string) => DocumentSessionClient;
	item: WorkspaceItemSummary;
	path: string;
	request: WorkspaceContentReadRequest;
}): Promise<WorkspaceContentReadResult> {
	if (input.request.mode === "pages") {
		return { code: "invalid_selection", path: input.path, status: "failed" };
	}

	const encodedCursor = input.request.mode === "continue" ? input.request.cursor : undefined;
	const cursor = encodedCursor ? decodeWorkspaceContentCursor(encodedCursor) : undefined;
	if (encodedCursor && (!cursor || cursor.kind !== "document" || cursor.itemId !== input.item.id)) {
		return { code: "invalid_cursor", path: input.path, status: "failed" };
	}

	const snapshot = await input.getDocumentSession(input.item.id).readMarkdown();
	if (cursor?.kind === "document" && cursor.revision !== snapshot.revision) {
		return { code: "content_changed", path: input.path, status: "failed" };
	}
	if (
		cursor?.kind === "document" &&
		cursor.offset >= snapshot.markdown.length &&
		snapshot.markdown.length > 0
	) {
		return { code: "invalid_cursor", path: input.path, status: "failed" };
	}

	const chunk = createDocumentChunk(
		snapshot.markdown,
		cursor?.kind === "document" ? cursor.offset : 0,
	);
	return {
		content: chunk.content,
		format: "markdown",
		location: chunk.location,
		...(chunk.nextOffset === undefined
			? {}
			: {
					nextCursor: encodeWorkspaceContentCursor({
						itemId: input.item.id,
						kind: "document",
						offset: chunk.nextOffset,
						revision: snapshot.revision,
						version: 1,
					}),
				}),
		path: input.path,
		status: "ready",
		type: "document",
	};
}

async function readFile(input: {
	bucket: R2Bucket;
	item: WorkspaceItemSummary;
	kernel: WorkspaceKernelClient;
	path: string;
	request: WorkspaceContentReadRequest;
}): Promise<WorkspaceContentReadResult> {
	const fileType = resolveWorkspaceFileTypeFromItem(input.item);
	if (!fileType || fileType.aiReadStrategy !== "markdown_extraction") {
		return { code: "unsupported_item_type", path: input.path, status: "failed" };
	}

	const projection = await input.kernel.readFileProjection({
		itemId: input.item.id,
		format: "pages",
	});
	if (
		!projection ||
		projection.status === "not_started" ||
		projection.status === "queued" ||
		projection.status === "processing"
	) {
		return { path: input.path, status: "pending", type: "file" };
	}
	if (
		projection.status !== "ready" ||
		projection.objectKey === null ||
		projection.sourceHash === null
	) {
		return { code: "projection_failed", path: input.path, status: "failed", type: "file" };
	}

	const encodedCursor = input.request.mode === "continue" ? input.request.cursor : undefined;
	const cursor = encodedCursor ? decodeWorkspaceContentCursor(encodedCursor) : undefined;
	if (encodedCursor && (!cursor || cursor.kind !== "file" || cursor.itemId !== input.item.id)) {
		return { code: "invalid_cursor", path: input.path, status: "failed" };
	}
	if (cursor?.kind === "file" && cursor.sourceHash !== projection.sourceHash) {
		return { code: "content_changed", path: input.path, status: "failed" };
	}
	let pageRead: Awaited<ReturnType<typeof readWorkspacePageProjection>>;
	try {
		pageRead = await readWorkspacePageProjection({
			bucket: input.bucket,
			expectedSourceHash: projection.sourceHash,
			manifestObjectKey: projection.objectKey,
			pages:
				cursor?.kind === "file"
					? String(cursor.nextPage)
					: input.request.mode === "pages"
						? input.request.range
						: undefined,
		});
	} catch (error) {
		if (error instanceof WorkspacePageSelectionError) {
			throw error;
		}
		return { code: "projection_failed", path: input.path, status: "failed", type: "file" };
	}
	const nextPage = Math.max(...pageRead.pages.returned) + 1;
	return {
		content: pageRead.content,
		format: "markdown",
		location: { kind: "pages", ...pageRead.pages },
		...(nextPage > pageRead.pages.total
			? {}
			: {
					nextCursor: encodeWorkspaceContentCursor({
						itemId: input.item.id,
						kind: "file",
						nextPage,
						sourceHash: projection.sourceHash,
						version: 1,
					}),
				}),
		path: input.path,
		status: "ready",
		type: "file",
	};
}

function createDocumentChunk(markdown: string, offset: number) {
	const hardEnd = Math.min(markdown.length, offset + maxDocumentChunkCharacters);
	const newlineEnd = markdown.lastIndexOf("\n", hardEnd);
	const end = hardEnd < markdown.length && newlineEnd > offset ? newlineEnd + 1 : hardEnd;
	const content = markdown.slice(offset, end).trimEnd();
	const startLine = content ? countLineBreaks(markdown.slice(0, offset)) + 1 : 0;
	const endLine = content ? startLine + countLineBreaks(content) : 0;

	return {
		content,
		location: {
			endLine,
			kind: "lines" as const,
			startLine,
			totalLines: markdown ? countLineBreaks(markdown) + 1 : 0,
		},
		...(end < markdown.length ? { nextOffset: end } : {}),
	};
}

function countLineBreaks(value: string) {
	return value.match(/\n/g)?.length ?? 0;
}

async function attachRelationPaths(
	kernel: WorkspaceKernelClient,
	readyResults: PendingReadyResult[],
) {
	if (readyResults.length === 0) {
		return;
	}
	const relatedItemIds = new Set<string>();
	for (const result of readyResults) {
		relatedItemIds.add(result.item.id);
		for (const relation of result.relations) {
			relatedItemIds.add(relation.fromItemId);
			relatedItemIds.add(relation.toItemId);
		}
	}
	const itemPaths = await kernel.getItemPaths({ itemIds: Array.from(relatedItemIds) });
	const pathsByItemId = new Map(itemPaths.map((item) => [item.itemId, item.path]));

	for (const result of readyResults) {
		const relations = serializeWorkspaceRelations({
			item: result.item,
			pathsByItemId,
			relations: result.relations,
		});
		if (relations.length > 0) {
			result.read.relations = relations;
		}
	}
}
