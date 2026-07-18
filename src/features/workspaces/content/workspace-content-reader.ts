import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import type {
	WorkspaceContentReadRequest,
	WorkspaceContentReadResult,
} from "#/features/workspaces/content/workspace-content-contract";
import type {
	DocumentMarkdownChunkReadInput,
	DocumentMarkdownChunkReadResult,
} from "#/features/workspaces/documents/document-markdown-chunk";
import { readWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import { serializeWorkspaceRelations } from "#/features/workspaces/operations/relations";
import { WorkspacePageSelectionError } from "#/features/workspaces/read-page-selection";
import {
	decodeWorkspaceContentCursor,
	encodeWorkspaceContentCursor,
} from "#/features/workspaces/content/workspace-content-cursor";

const maxWorkspaceContentBatchBytes = 2 * 1024 * 1024 + 64 * 1024;

interface DocumentContentReader {
	readMarkdownChunk(
		input: DocumentMarkdownChunkReadInput,
	): Promise<DocumentMarkdownChunkReadResult>;
}

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
	getDocumentSession: (itemId: string) => DocumentContentReader;
	kernel: WorkspaceKernelClient;
}): WorkspaceContentReader {
	return {
		async read(requests) {
			const encoder = new TextEncoder();
			const resolutions = await input.kernel.resolvePaths({
				paths: requests.map((request) => request.path),
			});
			const results: WorkspaceContentReadResult[] = [];
			const readyResults: PendingReadyResult[] = [];
			let returnedContentBytes = 0;

			// Reads stay ordered so each body is consumed before the shared byte budget advances.
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
					const contentBytes = encoder.encode(read.content).byteLength;
					if (returnedContentBytes + contentBytes > maxWorkspaceContentBatchBytes) {
						results.push({
							code: "read_budget_exceeded",
							path: resolution.path,
							status: "failed",
							...(resolution.item.type === "file" ? { type: "file" as const } : {}),
						});
						continue;
					}
					returnedContentBytes += contentBytes;

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
	getDocumentSession: (itemId: string) => DocumentContentReader;
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
	getDocumentSession: (itemId: string) => DocumentContentReader;
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

	const chunk = await input.getDocumentSession(input.item.id).readMarkdownChunk({
		expectedRevision: cursor?.kind === "document" ? cursor.revision : undefined,
		offset: cursor?.kind === "document" ? cursor.offset : 0,
	});
	if (chunk.status === "content_changed") {
		return { code: "content_changed", path: input.path, status: "failed" };
	}
	if (chunk.status === "invalid_offset") {
		return { code: "invalid_cursor", path: input.path, status: "failed" };
	}

	return {
		content: chunk.content,
		format: "markdown",
		location: { kind: "lines", ...chunk.location },
		...(chunk.nextOffset === undefined
			? {}
			: {
					nextCursor: encodeWorkspaceContentCursor({
						itemId: input.item.id,
						kind: "document",
						offset: chunk.nextOffset,
						revision: chunk.revision,
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
