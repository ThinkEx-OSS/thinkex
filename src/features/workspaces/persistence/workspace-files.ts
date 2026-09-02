import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { createWorkspaceItemRefKey } from "#/features/workspaces/locations/workspace-location";

import {
	workspaceFileAssets,
	workspaceItemPages,
	workspaceItemExtractions,
	workspaceItems,
} from "#/db/schema";
import { withDb } from "#/db/server";
import {
	type JsonValue,
	type WorkspaceItem,
	getWorkspaceItemContentKind,
	workspaceItemTypeSchema,
} from "#/features/workspaces/contracts";
import { getWorkspaceItemNameKey } from "#/features/workspaces/defaults";
import { WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } from "#/features/workspaces/files/workspace-file-preview.constants";
import type {
	CreateWorkspaceFileFromUploadArgs,
	ReadWorkspaceFileExtractionArgs,
	ReadWorkspaceFileExtractionResult,
	ReadWorkspaceFileSourceArgs,
	UpdateWorkspaceFileExtractionArgs,
	WorkspacePublishOutcome,
} from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	getWorkspaceUploadFamily,
	normalizeWorkspaceUploadFileName,
	resolveWorkspaceFileContentType,
	WorkspaceFileUploadError,
} from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import { notifyWorkspaceRoom } from "#/features/workspaces/realtime/workspace-room-notifier";
import { assertCanReadWorkspace } from "#/features/workspaces/server/permissions";
import {
	assertWorkspaceParentIsValid,
	createCompatibleFileMetadata,
	getActiveWorkspaceItemRow,
	getNextWorkspaceSortOrder,
	lockWorkspaceForActor,
	mapWorkspaceExtraction,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	requireActiveWorkspaceItemRow,
	requireWorkspaceFileAsset,
	resolveWorkspaceItemName,
	withWorkspaceTransaction,
	type Transaction,
} from "./workspace-postgres-support";

export async function createWorkspaceFileFromUpload(
	env: Cloudflare.Env,
	input: CreateWorkspaceFileFromUploadArgs & { workspaceId: string },
): Promise<WorkspaceCommandResult<WorkspaceItem>> {
	// R2 validation happens before opening the database transaction.
	const [source, preview] = await Promise.all([
		env.WORKSPACE_FILES.head(input.objectKey),
		env.WORKSPACE_FILES.head(input.preview.objectKey),
	]);
	if (!source || source.size !== input.fileSize) {
		throw new Error("Uploaded file was not found or did not match the upload request.");
	}
	if (!preview || preview.size !== input.preview.sizeBytes) {
		throw new Error("Uploaded file preview was not found or did not match the upload request.");
	}
	if (source.etag !== input.preview.sourceHash) {
		throw new Error("Uploaded file preview does not match its source.");
	}

	const command = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		if (await getActiveWorkspaceItemRow(transaction, input.workspaceId, input.id)) {
			throw new Error("Workspace item id already exists.");
		}
		const parentId = input.parentId ?? null;
		await assertWorkspaceParentIsValid(transaction, input.workspaceId, parentId);
		if (input.ownerItemId) {
			await assertValidWorkspaceImageOwner(transaction, input.workspaceId, input.ownerItemId);
		}
		const descriptor = getWorkspaceUploadFamily(input.assetKind);
		const originalName = normalizeWorkspaceUploadFileName(input.fileName, descriptor);
		const contentType = resolveWorkspaceFileContentType({
			contentType: input.contentType,
			descriptor,
			fileName: input.fileName,
		});
		const nameResolution = await resolveWorkspaceItemName(transaction, input.workspaceId, {
			itemId: input.id,
			type: "file",
			parentId,
			requestedName: originalName,
		});
		if (nameResolution.status === "conflict") {
			throw new Error("Automatic file naming unexpectedly produced a conflict.");
		}
		const metadata = createCompatibleFileMetadata({
			assetKind: input.assetKind,
			contentType,
			originalName,
			ownerItemId: input.ownerItemId,
			sizeBytes: source.size,
			source: input.source,
		});

		await transaction.insert(workspaceItems).values({
			id: input.id,
			workspaceId: input.workspaceId,
			parentId,
			type: "file",
			name: nameResolution.name,
			nameKey: getWorkspaceItemNameKey(nameResolution.name),
			refKey: createWorkspaceItemRefKey(),
			color: null,
			metadata,
			sortOrder: await getNextWorkspaceSortOrder(transaction, input.workspaceId, parentId),
		});
		await transaction.insert(workspaceFileAssets).values({
			itemId: input.id,
			sourceObjectKey: input.objectKey,
			sourceHash: source.etag,
			originalName,
			mimeType: contentType,
			sizeBytes: source.size,
			previewObjectKey: input.preview.objectKey,
			previewSizeBytes: input.preview.sizeBytes,
		});

		const item = await requireActiveWorkspaceItem(transaction, input.workspaceId, input.id);
		const revision = await nextWorkspaceRevision(transaction, input.workspaceId);
		return { result: item, revision };
	});
	await notifyWorkspaceRoom(env, {
		type: "workspace.items.upserted",
		workspaceId: input.workspaceId,
		revision: command.revision,
		items: [command.result],
	});
	return command;
}

// Owner-bound images skip the upload meter, so the exemption has to be
// enforceable here: only embeddable item types can own images, and one owner
// cannot accumulate unbounded unmetered uploads.
const maxWorkspaceImagesPerOwner = 100;

async function assertValidWorkspaceImageOwner(
	transaction: Transaction,
	workspaceId: string,
	ownerItemId: string,
) {
	const owner = await getActiveWorkspaceItemRow(transaction, workspaceId, ownerItemId);
	if (!owner) {
		throw new Error("Workspace image owner item does not exist.");
	}
	const ownerKind = getWorkspaceItemContentKind(workspaceItemTypeSchema.parse(owner.type));
	if (ownerKind !== "document" && ownerKind !== "structured") {
		throw new WorkspaceFileUploadError({
			code: "INVALID_UPLOAD",
			message: "Images can only be embedded in documents, flashcard sets, or quizzes.",
			status: 400,
		});
	}
	const [ownedCount] = await transaction
		.select({ count: count() })
		.from(workspaceItems)
		.where(
			and(
				eq(workspaceItems.workspaceId, workspaceId),
				sql`${workspaceItems.metadata}->>'ownerItemId' = ${ownerItemId}`,
			),
		);
	if ((ownedCount?.count ?? 0) >= maxWorkspaceImagesPerOwner) {
		throw new WorkspaceFileUploadError({
			code: "INVALID_UPLOAD",
			message: `One item can hold up to ${maxWorkspaceImagesPerOwner} images.`,
			status: 400,
		});
	}
}

export async function readWorkspaceFileSource(
	input: ReadWorkspaceFileSourceArgs & { workspaceId: string },
) {
	return await withDb(async (db) => {
		if (input.userId) {
			await assertCanReadWorkspace(db, { workspaceId: input.workspaceId, userId: input.userId });
		}
		const item = await requireActiveWorkspaceItemRow(db, input.workspaceId, input.itemId);
		if (getWorkspaceItemContentKind(item.type) !== "file")
			throw new Error("Workspace item is not a file.");
		const asset = await requireWorkspaceFileAsset(db, input.itemId);
		return {
			objectKey: asset.sourceObjectKey,
			contentType: asset.mimeType,
			fileName: asset.originalName,
			sizeBytes: asset.sizeBytes,
		};
	});
}

export async function readWorkspaceFilePreview(
	input: ReadWorkspaceFileSourceArgs & { workspaceId: string },
) {
	return await withDb(async (db) => {
		if (input.userId) {
			await assertCanReadWorkspace(db, { workspaceId: input.workspaceId, userId: input.userId });
		}
		const item = await requireActiveWorkspaceItemRow(db, input.workspaceId, input.itemId);
		if (getWorkspaceItemContentKind(item.type) !== "file")
			throw new Error("Workspace item is not a file.");
		const asset = await requireWorkspaceFileAsset(db, input.itemId);
		return {
			itemId: input.itemId,
			status: "ready" as const,
			objectKey: asset.previewObjectKey,
			contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
			sizeBytes: asset.previewSizeBytes,
			sourceHash: asset.sourceHash,
			metadataJson: { sizeBytes: asset.previewSizeBytes },
			updatedAt: item.updatedAt.toISOString(),
		};
	});
}

export async function readWorkspaceFileExtraction(
	input: ReadWorkspaceFileExtractionArgs & { workspaceId: string },
): Promise<ReadWorkspaceFileExtractionResult | null> {
	return await withDb(async (db) => {
		const item = await requireActiveWorkspaceItemRow(db, input.workspaceId, input.itemId);
		if (getWorkspaceItemContentKind(item.type) !== "file")
			throw new Error("Workspace item is not a file.");
		const [projection] = await db
			.select()
			.from(workspaceItemExtractions)
			.where(
				and(
					eq(workspaceItemExtractions.workspaceId, input.workspaceId),
					eq(workspaceItemExtractions.itemId, input.itemId),
				),
			)
			.limit(1);
		return projection ? mapWorkspaceExtraction(projection) : null;
	});
}

export async function updateWorkspaceFileExtraction(
	input: UpdateWorkspaceFileExtractionArgs & { workspaceId: string },
): Promise<WorkspacePublishOutcome> {
	const publication = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const item = await getActiveWorkspaceItemRow(transaction, input.workspaceId, input.itemId);
		if (!item) return { outcome: "discarded" as const };
		if (getWorkspaceItemContentKind(item.type) !== "file")
			throw new Error("Workspace item is not a file.");
		const now = new Date();
		await transaction
			.insert(workspaceItemExtractions)
			.values({
				workspaceId: input.workspaceId,
				itemId: input.itemId,
				status: input.status,
				provider: null,
				providerMode: null,
				tier: null,
				errorMessage: input.errorMessage ?? null,
				sourceHash: null,
				metadata: {},
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: workspaceItemExtractions.itemId,
				set: {
					status: input.status,
					provider: null,
					providerMode: null,
					tier: null,
					errorMessage: input.errorMessage ?? null,
					sourceHash: null,
					metadata: {},
					updatedAt: now,
				},
			});
		return { outcome: "applied" as const };
	});
	return publication.outcome;
}

/** Atomically replaces the current extracted pages after materialization. */
export async function publishWorkspaceFilePages(input: {
	workspaceId: string;
	itemId: string;
	pages: Iterable<{ markdown: string; markdownBytes: number; pageNumber: number }>;
	provider: string;
	providerMode: string;
	sourceHash: string;
	tier: "fast" | "enhanced";
	metadataJson?: Record<string, JsonValue>;
	actorUserId?: string | null;
}): Promise<WorkspacePublishOutcome> {
	const pages = Array.from(input.pages);

	const publication = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const item = await getActiveWorkspaceItemRow(transaction, input.workspaceId, input.itemId);
		if (!item) return { outcome: "discarded" as const };
		if (getWorkspaceItemContentKind(item.type) !== "file")
			throw new Error("Workspace item is not a file.");
		const asset = await requireWorkspaceFileAsset(transaction, input.itemId);
		if (asset.sourceHash !== input.sourceHash) return { outcome: "discarded" as const };
		const [currentExtraction] = await transaction
			.select({
				sourceHash: workspaceItemExtractions.sourceHash,
				tier: workspaceItemExtractions.tier,
			})
			.from(workspaceItemExtractions)
			.where(eq(workspaceItemExtractions.itemId, input.itemId))
			.limit(1);
		if (
			input.tier === "fast" &&
			currentExtraction?.tier === "enhanced" &&
			currentExtraction.sourceHash === input.sourceHash
		) {
			return { outcome: "discarded" as const };
		}

		await transaction.delete(workspaceItemPages).where(eq(workspaceItemPages.itemId, input.itemId));
		await transaction.insert(workspaceItemPages).values(
			pages.map((page) => ({
				itemId: input.itemId,
				pageNumber: page.pageNumber,
				markdown: page.markdown,
				markdownBytes: page.markdownBytes,
			})),
		);
		const now = new Date();
		const metadata = {
			...(input.metadataJson ?? {}),
			pageCount: pages.length,
			markdownLength: pages.reduce((total, page) => total + page.markdown.length, 0),
		};
		await transaction
			.insert(workspaceItemExtractions)
			.values({
				workspaceId: input.workspaceId,
				itemId: input.itemId,
				status: "ready",
				provider: input.provider,
				providerMode: input.providerMode,
				tier: input.tier,
				errorMessage: null,
				sourceHash: input.sourceHash,
				metadata,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: workspaceItemExtractions.itemId,
				set: {
					status: "ready",
					provider: input.provider,
					providerMode: input.providerMode,
					tier: input.tier,
					errorMessage: null,
					sourceHash: input.sourceHash,
					metadata,
					updatedAt: now,
				},
			});
		return { outcome: "applied" as const };
	});
	return publication.outcome;
}

export async function readWorkspaceFilePages(input: {
	itemId: string;
	pageNumbers: number[];
	workspaceId: string;
}) {
	if (input.pageNumbers.length === 0) return [];
	return await withDb(async (db) => {
		const item = await requireActiveWorkspaceItemRow(db, input.workspaceId, input.itemId);
		if (getWorkspaceItemContentKind(item.type) !== "file") {
			throw new Error("Workspace item is not a file.");
		}
		return await db
			.select({
				pageNumber: workspaceItemPages.pageNumber,
				markdown: workspaceItemPages.markdown,
				markdownBytes: workspaceItemPages.markdownBytes,
			})
			.from(workspaceItemPages)
			.where(
				and(
					eq(workspaceItemPages.itemId, input.itemId),
					inArray(workspaceItemPages.pageNumber, input.pageNumbers),
				),
			)
			.orderBy(asc(workspaceItemPages.pageNumber));
	});
}
