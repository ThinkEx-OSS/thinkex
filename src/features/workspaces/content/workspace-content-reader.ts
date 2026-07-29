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
import {
	resolveWorkspaceProjectionReadiness,
	type WorkspaceProjectionReadiness,
} from "#/features/workspaces/extraction/workspace-projection-readiness";
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

export async function readWorkspaceContent(input: {
	bucket: R2Bucket;
	getDocumentSession: (itemId: string) => DocumentContentReader;
	kernel: WorkspaceKernelClient;
	requests: WorkspaceContentReadRequest[];
}): Promise<WorkspaceContentReadResult[]> {
	const { requests } = input;
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
		return readDocument(input);
	}
	if (input.item.type === "file") {
		return readFile(input);
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
	if (encodedCursor && (!cursor || cursor.kind !== "document" || cursor.path !== input.path)) {
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
		itemId: input.item.id,
		location: { kind: "lines", ...chunk.location },
		...(chunk.nextOffset === undefined
			? {}
			: {
					nextCursor: encodeWorkspaceContentCursor({
						kind: "document",
						offset: chunk.nextOffset,
						path: input.path,
						revision: chunk.revision,
						version: 2,
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
	if (!fileType) {
		return { code: "unsupported_item_type", path: input.path, status: "failed" };
	}

	const projection = resolveWorkspaceProjectionReadiness(
		await input.kernel.readFileProjection({ itemId: input.item.id, format: "pages" }),
		Date.now(),
	);
	if (projection.state !== "ready") {
		return describeUnreadableProjection(projection, input.path);
	}

	const encodedCursor = input.request.mode === "continue" ? input.request.cursor : undefined;
	const cursor = encodedCursor ? decodeWorkspaceContentCursor(encodedCursor) : undefined;
	if (encodedCursor && (!cursor || cursor.kind !== "file" || cursor.path !== input.path)) {
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
			manifestObjectKey: projection.manifestObjectKey,
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
		assetKind: fileType.assetKind,
		content: pageRead.content,
		...(pageRead.emptyPages.length > 0 ? { emptyPages: pageRead.emptyPages } : {}),
		format: "markdown",
		itemId: input.item.id,
		location: { kind: "pages", ...pageRead.pages },
		...(nextPage > pageRead.pages.total
			? {}
			: {
					nextCursor: encodeWorkspaceContentCursor({
						kind: "file",
						nextPage,
						path: input.path,
						sourceHash: projection.sourceHash,
						version: 2,
					}),
				}),
		path: input.path,
		...(projection.provisional ? { provisional: true } : {}),
		status: "ready",
		type: "file",
	};
}

/**
 * Maps a non-ready projection onto the read result the model sees.
 *
 * @param projection - Readiness for a projection that is not serving content.
 * @param path - Absolute workspace path that was read.
 * @returns The pending or failed read result for that path.
 */
function describeUnreadableProjection(
	projection: Exclude<WorkspaceProjectionReadiness, { state: "ready" }>,
	path: string,
): WorkspaceContentReadResult {
	if (projection.state === "pending") {
		return {
			elapsedSeconds: projection.elapsedSeconds,
			path,
			phase: projection.phase,
			retryAfterSeconds: projection.retryAfterSeconds,
			status: "pending",
			type: "file",
		};
	}

	if (projection.state === "stalled") {
		return { code: "extraction_stalled", path, status: "failed", type: "file" };
	}

	if (projection.state === "failed") {
		return {
			code: "extraction_failed",
			...(projection.message ? { message: projection.message } : {}),
			path,
			status: "failed",
			type: "file",
		};
	}

	return { code: "projection_failed", path, status: "failed", type: "file" };
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
