import { and, asc, desc, eq, inArray, or } from "drizzle-orm";

import { workspaceDocumentCheckpoints, workspaceItemRelations, workspaceItems } from "#/db/schema";
import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	workspaceItemTypeSchema,
	workspaceRelationKindSchema,
} from "#/features/workspaces/contracts";
import { buildWorkspaceItemCreateBootstrap } from "#/features/workspaces/documents/document-item-content";
import { getWorkspaceItemNameKey, WORKSPACE_ITEM_SORT_STEP } from "#/features/workspaces/defaults";
import type { WorkspaceKernelClient } from "#/features/workspaces/kernel/workspace-kernel-access";
import { listWorkspaceKernelTreeItems } from "#/features/workspaces/kernel/workspace-kernel-list";
import {
	buildWorkspaceKernelItemPathIndex,
	buildWorkspaceKernelTree,
	normalizeWorkspacePath,
	resolveWorkspaceKernelItemPath,
	WorkspaceKernelPathError,
} from "#/features/workspaces/kernel/workspace-kernel-paths";
import type {
	CreateWorkspaceKernelFileFromUploadArgs,
	CreateWorkspaceKernelItemArgs,
	DeleteWorkspaceKernelItemsArgs,
	DeleteWorkspaceKernelItemsResult,
	GetWorkspaceKernelItemPathsArgs,
	LinkWorkspaceKernelItemsArgs,
	ListWorkspaceKernelItemRelationsArgs,
	ListWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsArgs,
	MoveWorkspaceKernelItemsResult,
	ReadWorkspaceFileExtractionArgs,
	ReadWorkspaceKernelFileSourceArgs,
	RenameWorkspaceKernelItemArgs,
	ResolveWorkspaceKernelPathsArgs,
	UpdateWorkspaceKernelItemColorArgs,
	UpdateWorkspaceFileExtractionArgs,
	WorkspaceKernelMutationOutcome,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import {
	resolveWorkspaceItemColorForCreate,
	workspaceItemSupportsCustomColor,
} from "#/features/workspaces/model/workspace-item-colors";
import type {
	WorkspaceCommandResult,
	WorkspacePageDelta,
} from "#/features/workspaces/realtime/messages";
import { assertCanReadWorkspace } from "#/features/workspaces/server/permissions";
import { PostgresWorkspaceDocuments } from "./workspace-postgres-documents";
import { PostgresWorkspaceFiles } from "./workspace-postgres-files";
import {
	assertWorkspaceParentIsValid,
	collectDescendants,
	getActiveWorkspaceItemRows,
	getNextWorkspaceSortOrder,
	getActiveWorkspaceItemRow,
	getWorkspaceItemsByIds,
	getWorkspaceRevision,
	hasSelectedAncestor,
	isDescendantOf,
	lockWorkspaceForActor,
	nextWorkspaceRevision,
	requireActiveWorkspaceItem,
	requireActiveWorkspaceItemRow,
	readWorkspacePageSnapshot,
	resolveWorkspaceItemName,
	withWorkspaceDatabase,
	withWorkspaceTransaction,
	type ItemRow,
} from "./workspace-postgres-support";

/**
 * Postgres implementation of the existing workspace-kernel persistence surface.
 *
 * Page-affecting mutations commit a workspace revision atomically, then publish
 * their canonical cache delta through the injected callback.
 */
export class PostgresWorkspacePersistence implements WorkspaceKernelClient {
	private readonly files: PostgresWorkspaceFiles;
	private readonly documents: PostgresWorkspaceDocuments;

	constructor(
		private readonly workspaceId: string,
		bucket: R2Bucket,
		private readonly onChange?: (change: WorkspacePageDelta) => Promise<void>,
		private readonly onItemsDeleted?: (input: {
			workspaceId: string;
			documentItemIds: string[];
			fileItemIds: string[];
		}) => Promise<void>,
	) {
		this.files = new PostgresWorkspaceFiles(workspaceId, bucket, onChange);
		this.documents = new PostgresWorkspaceDocuments(workspaceId, onChange);
	}

	async getPage(input: { userId?: string } = {}) {
		return await withWorkspaceDatabase(async (db) => {
			return await db.transaction(
				async (transaction) => {
					if (input.userId) {
						await assertCanReadWorkspace(transaction, {
							workspaceId: this.workspaceId,
							userId: input.userId,
						});
					}
					return await readWorkspacePageSnapshot(transaction, this.workspaceId);
				},
				{ isolationLevel: "repeatable read" },
			);
		});
	}

	async listTreeItems(input: ListWorkspaceKernelItemsArgs = {}) {
		const page = await this.getPage();
		return listWorkspaceKernelTreeItems({
			...input,
			tree: buildWorkspaceKernelTree(page.items),
		});
	}

	async resolvePaths(input: ResolveWorkspaceKernelPathsArgs) {
		const tree = buildWorkspaceKernelTree((await this.getPage()).items);
		return input.paths.map((path) => {
			try {
				const normalized = normalizeWorkspacePath(path);
				if (normalized === "/") {
					return { path: normalized, status: "root" as const };
				}
				const item = resolveWorkspaceKernelItemPath(normalized, tree);
				return item
					? { item, path: normalized, status: "item" as const }
					: { path: normalized, status: "not_found" as const };
			} catch (error) {
				if (error instanceof WorkspaceKernelPathError && error.code === "path_not_absolute") {
					return { code: error.code, path, status: "invalid_path" as const };
				}
				throw error;
			}
		});
	}

	async getItemPaths(input: GetWorkspaceKernelItemPathsArgs) {
		const paths = buildWorkspaceKernelItemPathIndex((await this.getPage()).items);
		return input.itemIds.flatMap((itemId) => {
			const path = paths.get(itemId);
			return path ? [{ itemId, path }] : [];
		});
	}

	async listItemRelations(input: ListWorkspaceKernelItemRelationsArgs) {
		return await withWorkspaceDatabase(async (db) => {
			await requireActiveWorkspaceItemRow(db, this.workspaceId, input.itemId);
			const rows = await db
				.select()
				.from(workspaceItemRelations)
				.where(
					and(
						eq(workspaceItemRelations.workspaceId, this.workspaceId),
						or(
							eq(workspaceItemRelations.fromItemId, input.itemId),
							eq(workspaceItemRelations.toItemId, input.itemId),
						),
					),
				)
				.orderBy(desc(workspaceItemRelations.createdAt), asc(workspaceItemRelations.id))
				.limit(Math.max(1, Math.min(input.limit ?? 40, 100)));

			return rows.map((row) => ({
				id: row.id,
				fromItemId: row.fromItemId,
				toItemId: row.toItemId,
				kind: workspaceRelationKindSchema.parse(row.kind),
				note: row.note || null,
			}));
		});
	}

	async linkItems(input: LinkWorkspaceKernelItemsArgs) {
		await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			const itemIds = Array.from(
				new Set(input.relations.flatMap((relation) => [relation.fromItemId, relation.toItemId])),
			);
			for (const itemId of itemIds) {
				await requireActiveWorkspaceItemRow(transaction, this.workspaceId, itemId);
			}

			if (input.relations.length > 0) {
				await transaction
					.insert(workspaceItemRelations)
					.values(
						input.relations.map((relation) => ({
							id: crypto.randomUUID(),
							workspaceId: this.workspaceId,
							fromItemId: relation.fromItemId,
							toItemId: relation.toItemId,
							kind: workspaceRelationKindSchema.parse(relation.kind),
							note: relation.note?.trim() ?? "",
						})),
					)
					.onConflictDoNothing();
			}
		});
	}

	async createItem(
		input: CreateWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>> {
		const type = workspaceItemTypeSchema.parse(input.type);
		if (type === "file") {
			throw new Error("Binary workspace files must be created through the upload flow.");
		}
		const bootstrap = buildWorkspaceItemCreateBootstrap({
			type,
			initialContent: input.initialContent,
			metadataJson: input.metadataJson,
		});
		const color = resolveWorkspaceItemColorForCreate({ type, color: input.color });

		const outcome = await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			if (await getActiveWorkspaceItemRow(transaction, this.workspaceId, input.id)) {
				throw new Error("Workspace item id already exists.");
			}
			const parentId = input.parentId ?? null;
			await assertWorkspaceParentIsValid(transaction, this.workspaceId, parentId);
			const nameResolution = await resolveWorkspaceItemName(transaction, this.workspaceId, {
				itemId: input.id,
				type,
				parentId,
				requestedName: input.name,
				onNameConflict: input.onNameConflict,
			});
			if (nameResolution.status === "conflict") {
				return nameResolution;
			}

			for (const relation of input.initialRelations ?? []) {
				if (relation.fromItemId !== input.id) {
					throw new Error("Initial workspace relations must originate from the created item.");
				}
				await requireActiveWorkspaceItemRow(transaction, this.workspaceId, relation.toItemId);
			}

			await transaction.insert(workspaceItems).values({
				id: input.id,
				workspaceId: this.workspaceId,
				parentId,
				type,
				name: nameResolution.name,
				nameKey: getWorkspaceItemNameKey(nameResolution.name),
				color,
				metadata: bootstrap.metadataJson,
				sortOrder: await getNextWorkspaceSortOrder(transaction, this.workspaceId, parentId),
			});
			if (type === "document") {
				await transaction.insert(workspaceDocumentCheckpoints).values({
					itemId: input.id,
					content: bootstrap.initialContent,
				});
			}

			const initialRelations = input.initialRelations ?? [];
			if (initialRelations.length > 0) {
				await transaction.insert(workspaceItemRelations).values(
					initialRelations.map((relation) => ({
						id: crypto.randomUUID(),
						workspaceId: this.workspaceId,
						fromItemId: input.id,
						toItemId: relation.toItemId,
						kind: workspaceRelationKindSchema.parse(relation.kind),
						note: relation.note?.trim() ?? "",
					})),
				);
			}

			const item = await requireActiveWorkspaceItem(transaction, this.workspaceId, input.id);
			const revision = await nextWorkspaceRevision(transaction, this.workspaceId);
			return {
				status: "applied" as const,
				command: {
					result: item,
					revision,
				},
			};
		});
		if (outcome.status === "applied") {
			await this.notifyItemsUpserted([outcome.command.result], outcome.command.revision);
		}
		return outcome;
	}

	async createFileFromUpload(input: CreateWorkspaceKernelFileFromUploadArgs) {
		return await this.files.createFileFromUpload(input);
	}

	async renameItem(
		input: RenameWorkspaceKernelItemArgs,
	): Promise<WorkspaceKernelMutationOutcome<WorkspaceItemSummary>> {
		if (!input.name.trim()) {
			throw new Error("Item name is required.");
		}
		const outcome = await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			const item = await requireActiveWorkspaceItemRow(transaction, this.workspaceId, input.itemId);
			const nameResolution = await resolveWorkspaceItemName(transaction, this.workspaceId, {
				itemId: item.id,
				type: workspaceItemTypeSchema.parse(item.type),
				parentId: item.parentId,
				requestedName: input.name,
				excludeItemId: item.id,
				onNameConflict: input.onNameConflict,
			});
			if (nameResolution.status === "conflict") {
				return nameResolution;
			}
			await transaction
				.update(workspaceItems)
				.set({
					name: nameResolution.name,
					nameKey: getWorkspaceItemNameKey(nameResolution.name),
					updatedAt: new Date(),
				})
				.where(
					and(eq(workspaceItems.id, item.id), eq(workspaceItems.workspaceId, this.workspaceId)),
				);
			const updated = await requireActiveWorkspaceItem(transaction, this.workspaceId, item.id);
			const revision = await nextWorkspaceRevision(transaction, this.workspaceId);
			return {
				status: "applied" as const,
				command: {
					result: updated,
					revision,
				},
			};
		});
		if (outcome.status === "applied") {
			await this.notifyItemsUpserted([outcome.command.result], outcome.command.revision);
		}
		return outcome;
	}

	async moveItems(
		input: MoveWorkspaceKernelItemsArgs,
	): Promise<WorkspaceKernelMutationOutcome<MoveWorkspaceKernelItemsResult>> {
		const outcome = await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			const parentId = input.parentId ?? null;
			await assertWorkspaceParentIsValid(transaction, this.workspaceId, parentId);
			const allRows = await getActiveWorkspaceItemRows(transaction, this.workspaceId);
			const rowsById = new Map(allRows.map((row) => [row.id, row]));
			const selectedIds = Array.from(new Set(input.items.map((item) => item.itemId)));
			if (selectedIds.length === 0) {
				throw new Error("At least one workspace item is required.");
			}
			for (const itemId of selectedIds) {
				if (!rowsById.has(itemId)) {
					throw new Error("Workspace item not found.");
				}
			}
			const selected = new Set(selectedIds);
			const roots = selectedIds
				.map((itemId) => rowsById.get(itemId)!)
				.filter((row) => !hasSelectedAncestor(row, selected, rowsById));
			for (const row of roots) {
				if (parentId === row.id || isDescendantOf(parentId, row.id, rowsById)) {
					throw new Error("An item cannot be moved into itself.");
				}
			}

			const requestedById = new Map(input.items.map((item) => [item.itemId, item]));
			const reservedNames: string[] = [];
			const planned: Array<{ row: ItemRow; name: string; sortOrder?: number }> = [];
			for (const row of roots) {
				const resolution = await resolveWorkspaceItemName(transaction, this.workspaceId, {
					itemId: row.id,
					type: workspaceItemTypeSchema.parse(row.type),
					parentId,
					requestedName: row.name,
					excludeItemId: row.id,
					onNameConflict: input.onNameConflict,
					reservedNames,
				});
				if (resolution.status === "conflict") {
					return resolution;
				}
				reservedNames.push(resolution.name);
				planned.push({
					row,
					name: resolution.name,
					sortOrder: requestedById.get(row.id)?.sortOrder,
				});
			}

			let nextSortOrder = await getNextWorkspaceSortOrder(transaction, this.workspaceId, parentId);
			for (const move of planned) {
				const sortOrder = move.sortOrder ?? nextSortOrder;
				nextSortOrder = Math.max(
					nextSortOrder + WORKSPACE_ITEM_SORT_STEP,
					sortOrder + WORKSPACE_ITEM_SORT_STEP,
				);
				await transaction
					.update(workspaceItems)
					.set({
						parentId,
						name: move.name,
						nameKey: getWorkspaceItemNameKey(move.name),
						sortOrder,
						updatedAt: new Date(),
					})
					.where(eq(workspaceItems.id, move.row.id));
			}

			const movedItems = await getWorkspaceItemsByIds(
				transaction,
				this.workspaceId,
				planned.map((move) => move.row.id),
			);
			const revision = await nextWorkspaceRevision(transaction, this.workspaceId);
			return {
				status: "applied" as const,
				command: {
					result: movedItems,
					revision,
				},
			};
		});
		if (outcome.status === "applied") {
			await this.notifyItemsUpserted(outcome.command.result, outcome.command.revision);
		}
		return outcome;
	}

	async updateItemColor(
		input: UpdateWorkspaceKernelItemColorArgs,
	): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
		const command = await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			const row = await requireActiveWorkspaceItemRow(transaction, this.workspaceId, input.itemId);
			if (!workspaceItemSupportsCustomColor(workspaceItemTypeSchema.parse(row.type))) {
				throw new Error("Only folders support custom colors.");
			}
			await transaction
				.update(workspaceItems)
				.set({ color: input.color, updatedAt: new Date() })
				.where(eq(workspaceItems.id, input.itemId));
			const item = await requireActiveWorkspaceItem(transaction, this.workspaceId, input.itemId);
			const revision = await nextWorkspaceRevision(transaction, this.workspaceId);
			return { result: item, revision };
		});
		await this.notifyItemsUpserted([command.result], command.revision);
		return command;
	}

	async deleteItems(
		input: DeleteWorkspaceKernelItemsArgs,
	): Promise<WorkspaceCommandResult<DeleteWorkspaceKernelItemsResult>> {
		const command = await withWorkspaceTransaction(async (transaction) => {
			await lockWorkspaceForActor(transaction, this.workspaceId, input.actorUserId);
			const allRows = await getActiveWorkspaceItemRows(transaction, this.workspaceId);
			const rowsById = new Map(allRows.map((row) => [row.id, row]));
			const selectedIds = Array.from(new Set(input.itemIds)).filter((id) => rowsById.has(id));
			const selected = new Set(selectedIds);
			const rootIds = selectedIds.filter(
				(itemId) => !hasSelectedAncestor(rowsById.get(itemId)!, selected, rowsById),
			);
			const deleteIds = collectDescendants(rootIds, allRows);
			const deletingRows = deleteIds.flatMap((itemId) => {
				const row = rowsById.get(itemId);
				return row ? [row] : [];
			});
			if (deleteIds.length > 0) {
				// Parent and relation foreign keys cascade from these roots.
				await transaction.delete(workspaceItems).where(inArray(workspaceItems.id, rootIds));
			}

			const revision =
				deleteIds.length > 0
					? await nextWorkspaceRevision(transaction, this.workspaceId)
					: await getWorkspaceRevision(transaction, this.workspaceId);
			const result = { itemIds: rootIds, deletedItemIds: deleteIds };
			return {
				result,
				documentItemIds: deletingRows.filter((row) => row.type === "document").map((row) => row.id),
				fileItemIds: deletingRows.filter((row) => row.type === "file").map((row) => row.id),
				revision,
			};
		});
		await Promise.all([
			command.result.deletedItemIds.length > 0
				? this.onChange?.({
						type: "workspace.items.deleted",
						workspaceId: this.workspaceId,
						revision: command.revision,
						itemIds: command.result.deletedItemIds,
					})
				: undefined,
			command.documentItemIds.length > 0 || command.fileItemIds.length > 0
				? this.onItemsDeleted?.({
						workspaceId: this.workspaceId,
						documentItemIds: command.documentItemIds,
						fileItemIds: command.fileItemIds,
					})
				: undefined,
		]);
		return { revision: command.revision, result: command.result };
	}

	async readDocumentCheckpoint(input: Parameters<PostgresWorkspaceDocuments["readCheckpoint"]>[0]) {
		return await this.documents.readCheckpoint(input);
	}

	async commitDocumentCheckpoint(
		input: Parameters<PostgresWorkspaceDocuments["commitCheckpoint"]>[0],
	) {
		return await this.documents.commitCheckpoint(input);
	}

	async getFileSource(input: ReadWorkspaceKernelFileSourceArgs) {
		return await this.files.getFileSource(input);
	}

	async readFilePreview(input: ReadWorkspaceKernelFileSourceArgs) {
		return await this.files.readFilePreview(input);
	}

	async readFileExtraction(input: ReadWorkspaceFileExtractionArgs) {
		return await this.files.readFileExtraction(input);
	}

	async updateFileExtraction(input: UpdateWorkspaceFileExtractionArgs) {
		return await this.files.updateFileExtraction(input);
	}

	async publishPages(input: Parameters<PostgresWorkspaceFiles["publishPages"]>[0]) {
		return await this.files.publishPages(input);
	}

	async readPages(input: Parameters<PostgresWorkspaceFiles["readPages"]>[0]) {
		return await this.files.readPages(input);
	}

	private async notifyItemsUpserted(items: WorkspaceItemSummary[], revision: number) {
		await this.onChange?.({
			type: "workspace.items.upserted",
			workspaceId: this.workspaceId,
			revision,
			items,
		});
	}
}
