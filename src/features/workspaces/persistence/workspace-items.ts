import { and, asc, desc, eq, inArray, like, notInArray, or } from "drizzle-orm";

import { workspaceItemContents, workspaceItemRelations, workspaceItems } from "#/db/schema";
import { withDb } from "#/db/server";
import { createWorkspaceItemRefKey } from "#/features/workspaces/locations/workspace-location";
import {
	type JsonValue,
	type WorkspaceItem,
	getWorkspaceItemContentKind,
	workspaceItemTypeSchema,
	workspaceRelationKindSchema,
} from "#/features/workspaces/contracts";
import { getMetadataOwnerItemId } from "#/features/workspaces/model/workspace-file";
import { buildWorkspaceItemCreateBootstrap } from "#/features/workspaces/model/workspace-item-create-bootstrap";
import { getWorkspaceItemNameKey, WORKSPACE_ITEM_SORT_STEP } from "#/features/workspaces/defaults";
import { listWorkspaceTreeItems as formatWorkspaceTreeItems } from "#/features/workspaces/model/workspace-tree-list";
import {
	buildWorkspaceItemPathIndex,
	buildWorkspaceTree,
	normalizeWorkspacePath,
	resolveWorkspaceItemPath,
	WorkspacePathError,
} from "#/features/workspaces/model/workspace-paths";
import type {
	CreateWorkspaceItemArgs,
	DeleteWorkspaceItemsArgs,
	DeleteWorkspaceItemsResult,
	GetWorkspaceItemPathsArgs,
	LinkWorkspaceItemsArgs,
	ListWorkspaceItemRelationsArgs,
	ListWorkspaceItemsArgs,
	MoveWorkspaceItemsArgs,
	MoveWorkspaceItemsResult,
	RenameWorkspaceItemArgs,
	ResolveWorkspacePathsArgs,
	UpdateWorkspaceItemColorArgs,
	WorkspaceMutationOutcome,
} from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	resolveWorkspaceItemColorForCreate,
	workspaceItemSupportsCustomColor,
} from "#/features/workspaces/model/workspace-item-colors";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import {
	notifyWorkspaceRoom,
	requestWorkspaceItemCleanup,
} from "#/features/workspaces/realtime/workspace-room-notifier";
import { workspaceItemContentValues } from "#/features/workspaces/search/workspace-search-text";
import { assertCanReadWorkspace } from "#/features/workspaces/server/permissions";
import {
	assertWorkspaceParentIsValid,
	collectDescendants,
	getActiveWorkspaceItemRow,
	getActiveWorkspaceItemRows,
	getNextWorkspaceSortOrder,
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
	withWorkspaceTransaction,
	type Transaction,
	type ItemRow,
} from "./workspace-postgres-support";

type WorkspaceScoped<T> = T & { workspaceId: string };

export async function readWorkspacePage(input: { userId?: string; workspaceId: string }) {
	return await withDb(async (db) => {
		return await db.transaction(
			async (transaction) => {
				if (input.userId) {
					await assertCanReadWorkspace(transaction, {
						workspaceId: input.workspaceId,
						userId: input.userId,
					});
				}
				return await readWorkspacePageSnapshot(transaction, input.workspaceId);
			},
			{ isolationLevel: "repeatable read" },
		);
	});
}

export async function listWorkspaceTreeItems(input: WorkspaceScoped<ListWorkspaceItemsArgs>) {
	const page = await readWorkspacePage({ workspaceId: input.workspaceId });
	return formatWorkspaceTreeItems({
		...input,
		tree: buildWorkspaceTree(page.items),
	});
}

export async function resolveWorkspacePaths(input: WorkspaceScoped<ResolveWorkspacePathsArgs>) {
	const tree = buildWorkspaceTree(
		(await readWorkspacePage({ workspaceId: input.workspaceId })).items,
	);
	return input.paths.map((path) => {
		try {
			const normalized = normalizeWorkspacePath(path);
			if (normalized === "/") {
				return { path: normalized, status: "root" as const };
			}
			const item = resolveWorkspaceItemPath(normalized, tree);
			return item
				? { item, path: normalized, status: "item" as const }
				: { path: normalized, status: "not_found" as const };
		} catch (error) {
			if (error instanceof WorkspacePathError && error.code === "path_not_absolute") {
				return { code: error.code, path, status: "invalid_path" as const };
			}
			throw error;
		}
	});
}

export async function getWorkspaceItemPaths(input: WorkspaceScoped<GetWorkspaceItemPathsArgs>) {
	const paths = buildWorkspaceItemPathIndex(
		(await readWorkspacePage({ workspaceId: input.workspaceId })).items,
	);
	return input.itemIds.flatMap((itemId) => {
		const path = paths.get(itemId);
		return path ? [{ itemId, path }] : [];
	});
}

/**
 * Resolves item address refKeys to live items and their paths. Costs one
 * workspace page read however many refKeys the caller then looks up, so
 * callers with several refs to resolve share a single index.
 */
export async function getWorkspaceItemRefKeyIndex(input: WorkspaceScoped<object>) {
	const { items } = await readWorkspacePage({ workspaceId: input.workspaceId });
	const paths = buildWorkspaceItemPathIndex(items);
	return new Map(
		items.flatMap((item) => {
			const path = paths.get(item.id);
			return path ? [[item.refKey, { item, path }] as const] : [];
		}),
	);
}

export async function listWorkspaceItemRelations(
	input: WorkspaceScoped<ListWorkspaceItemRelationsArgs>,
) {
	return await withDb(async (db) => {
		await requireActiveWorkspaceItemRow(db, input.workspaceId, input.itemId);
		const rows = await db
			.select()
			.from(workspaceItemRelations)
			.where(
				and(
					eq(workspaceItemRelations.workspaceId, input.workspaceId),
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

export async function linkWorkspaceItems(input: WorkspaceScoped<LinkWorkspaceItemsArgs>) {
	await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const itemIds = Array.from(
			new Set(input.relations.flatMap((relation) => [relation.fromItemId, relation.toItemId])),
		);
		for (const itemId of itemIds) {
			await requireActiveWorkspaceItemRow(transaction, input.workspaceId, itemId);
		}

		if (input.relations.length > 0) {
			await transaction
				.insert(workspaceItemRelations)
				.values(
					input.relations.map((relation) => ({
						id: crypto.randomUUID(),
						workspaceId: input.workspaceId,
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

export async function createWorkspaceItem(
	env: Cloudflare.Env,
	input: WorkspaceScoped<CreateWorkspaceItemArgs>,
): Promise<WorkspaceMutationOutcome<WorkspaceItem>> {
	const type = workspaceItemTypeSchema.parse(input.type);
	if (getWorkspaceItemContentKind(type) === "file") {
		throw new Error("Binary workspace files must be created through the upload flow.");
	}
	const bootstrap = buildWorkspaceItemCreateBootstrap({
		type,
		initialContent: input.initialContent,
		metadataJson: input.metadataJson,
	});
	const color = resolveWorkspaceItemColorForCreate({ type, color: input.color });

	const outcome = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		if (await getActiveWorkspaceItemRow(transaction, input.workspaceId, input.id)) {
			throw new Error("Workspace item id already exists.");
		}
		const parentId = input.parentId ?? null;
		await assertWorkspaceParentIsValid(transaction, input.workspaceId, parentId);
		const nameResolution = await resolveWorkspaceItemName(transaction, input.workspaceId, {
			itemId: input.id,
			type,
			parentId,
			requestedName: input.name,
			onNameConflict: input.onNameConflict,
		});
		if (nameResolution.status === "conflict") {
			return nameResolution;
		}

		await transaction.insert(workspaceItems).values({
			id: input.id,
			workspaceId: input.workspaceId,
			parentId,
			type,
			name: nameResolution.name,
			nameKey: getWorkspaceItemNameKey(nameResolution.name),
			refKey: createWorkspaceItemRefKey(),
			color,
			metadata: bootstrap.metadataJson,
			sortOrder: await getNextWorkspaceSortOrder(transaction, input.workspaceId, parentId),
		});
		const contentKind = getWorkspaceItemContentKind(type);
		if (contentKind === "document" || contentKind === "structured") {
			if (!bootstrap.initialContent) {
				throw new Error("Workspace item content is required.");
			}
			await transaction.insert(workspaceItemContents).values({
				itemId: input.id,
				...workspaceItemContentValues(type, bootstrap.initialContent),
			});
		}

		const item = await requireActiveWorkspaceItem(transaction, input.workspaceId, input.id);
		const revision = await nextWorkspaceRevision(transaction, input.workspaceId);
		return {
			status: "applied" as const,
			command: {
				result: item,
				revision,
			},
		};
	});
	if (outcome.status === "applied") {
		await notifyWorkspaceItemsUpserted(
			env,
			input.workspaceId,
			[outcome.command.result],
			outcome.command.revision,
		);
	}
	return outcome;
}

export async function renameWorkspaceItem(
	env: Cloudflare.Env,
	input: WorkspaceScoped<RenameWorkspaceItemArgs>,
): Promise<WorkspaceMutationOutcome<WorkspaceItem>> {
	if (!input.name.trim()) {
		throw new Error("Item name is required.");
	}
	const outcome = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const item = await requireActiveWorkspaceItemRow(transaction, input.workspaceId, input.itemId);
		const nameResolution = await resolveWorkspaceItemName(transaction, input.workspaceId, {
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
				and(eq(workspaceItems.id, item.id), eq(workspaceItems.workspaceId, input.workspaceId)),
			);
		const updated = await requireActiveWorkspaceItem(transaction, input.workspaceId, item.id);
		const revision = await nextWorkspaceRevision(transaction, input.workspaceId);
		return {
			status: "applied" as const,
			command: {
				result: updated,
				revision,
			},
		};
	});
	if (outcome.status === "applied") {
		await notifyWorkspaceItemsUpserted(
			env,
			input.workspaceId,
			[outcome.command.result],
			outcome.command.revision,
		);
	}
	return outcome;
}

export async function moveWorkspaceItems(
	env: Cloudflare.Env,
	input: WorkspaceScoped<MoveWorkspaceItemsArgs>,
): Promise<WorkspaceMutationOutcome<MoveWorkspaceItemsResult>> {
	const outcome = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const parentId = input.parentId ?? null;
		await assertWorkspaceParentIsValid(transaction, input.workspaceId, parentId);
		const allRows = await getActiveWorkspaceItemRows(transaction, input.workspaceId);
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
			const resolution = await resolveWorkspaceItemName(transaction, input.workspaceId, {
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

		let nextSortOrder = await getNextWorkspaceSortOrder(transaction, input.workspaceId, parentId);
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
			input.workspaceId,
			planned.map((move) => move.row.id),
		);
		const revision = await nextWorkspaceRevision(transaction, input.workspaceId);
		return {
			status: "applied" as const,
			command: {
				result: movedItems,
				revision,
			},
		};
	});
	if (outcome.status === "applied") {
		await notifyWorkspaceItemsUpserted(
			env,
			input.workspaceId,
			outcome.command.result,
			outcome.command.revision,
		);
	}
	return outcome;
}

export async function updateWorkspaceItemColor(
	env: Cloudflare.Env,
	input: WorkspaceScoped<UpdateWorkspaceItemColorArgs>,
): Promise<WorkspaceCommandResult<WorkspaceItem>> {
	const command = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const row = await requireActiveWorkspaceItemRow(transaction, input.workspaceId, input.itemId);
		if (!workspaceItemSupportsCustomColor(workspaceItemTypeSchema.parse(row.type))) {
			throw new Error("Only folders support custom colors.");
		}
		await transaction
			.update(workspaceItems)
			.set({ color: input.color, updatedAt: new Date() })
			.where(eq(workspaceItems.id, input.itemId));
		const item = await requireActiveWorkspaceItem(transaction, input.workspaceId, input.itemId);
		const revision = await nextWorkspaceRevision(transaction, input.workspaceId);
		return { result: item, revision };
	});
	await notifyWorkspaceItemsUpserted(env, input.workspaceId, [command.result], command.revision);
	return command;
}

export async function deleteWorkspaceItems(
	env: Cloudflare.Env,
	input: WorkspaceScoped<DeleteWorkspaceItemsArgs>,
): Promise<WorkspaceCommandResult<DeleteWorkspaceItemsResult>> {
	const command = await withWorkspaceTransaction(async (transaction) => {
		await lockWorkspaceForActor(transaction, input.workspaceId, input.actorUserId);
		const allRows = await getActiveWorkspaceItemRows(transaction, input.workspaceId);
		const rowsById = new Map(allRows.map((row) => [row.id, row]));
		const selectedIds = Array.from(new Set(input.itemIds)).filter((id) => rowsById.has(id));
		const selected = new Set(selectedIds);
		const rootIds = selectedIds.filter(
			(itemId) => !hasSelectedAncestor(rowsById.get(itemId)!, selected, rowsById),
		);
		const deleteIds = collectDescendants(rootIds, allRows);
		// Images pasted into a deleted item ride along — unless another surviving
		// item still embeds them (copy-paste shares the reference, not the bytes),
		// in which case the bytes stay and only the dead owner link goes stale.
		const orphanedSidecarIds = await collectUnreferencedSidecarIds(transaction, allRows, deleteIds);
		deleteIds.push(...orphanedSidecarIds);
		const deletingRows = deleteIds.flatMap((itemId) => {
			const row = rowsById.get(itemId);
			return row ? [row] : [];
		});
		if (deleteIds.length > 0) {
			// Parent and relation foreign keys cascade from these roots.
			await transaction
				.delete(workspaceItems)
				.where(inArray(workspaceItems.id, [...rootIds, ...orphanedSidecarIds]));
		}

		const revision =
			deleteIds.length > 0
				? await nextWorkspaceRevision(transaction, input.workspaceId)
				: await getWorkspaceRevision(transaction, input.workspaceId);
		const result = { itemIds: rootIds, deletedItemIds: deleteIds };
		// Deleted rows fan out to per-store cleanup by where their content lives, not by
		// item type, so a new type backed by an existing store is collected here for free.
		const documentItemIds: string[] = [];
		const fileItemIds: string[] = [];
		for (const row of deletingRows) {
			const contentKind = getWorkspaceItemContentKind(workspaceItemTypeSchema.parse(row.type));
			if (contentKind === "document") {
				documentItemIds.push(row.id);
			} else if (contentKind === "file") {
				fileItemIds.push(row.id);
			}
		}
		return { result, documentItemIds, fileItemIds, revision };
	});

	async function collectUnreferencedSidecarIds(
		transaction: Transaction,
		allRows: Awaited<ReturnType<typeof getActiveWorkspaceItemRows>>,
		deleteIds: string[],
	) {
		const deleted = new Set(deleteIds);
		const liveIds = new Set(allRows.map((row) => row.id));
		const sidecarIds = allRows
			.filter((row) => {
				if (deleted.has(row.id)) return false;
				const ownerItemId = getMetadataOwnerItemId(row.metadata as Record<string, JsonValue>);
				// A dangling owner means an earlier delete kept this sidecar for a
				// reference that may itself be going away now — re-check it, or it
				// leaks invisibly forever.
				return ownerItemId !== null && (deleted.has(ownerItemId) || !liveIds.has(ownerItemId));
			})
			.map((row) => row.id);
		if (sidecarIds.length === 0) return [];

		// Content is JSON text and image nodes store the item id verbatim, so a
		// LIKE over surviving contents is an exact-enough reference check — the
		// canonical content can lag a live editing session by one flush, which
		// only ever errs toward keeping bytes.
		const orphaned: string[] = [];
		for (const sidecarId of sidecarIds) {
			const referenced = await transaction
				.select({ itemId: workspaceItemContents.itemId })
				.from(workspaceItemContents)
				.where(
					and(
						like(workspaceItemContents.content, `%${sidecarId}%`),
						notInArray(workspaceItemContents.itemId, [...deleteIds, ...sidecarIds]),
					),
				)
				.limit(1);
			if (referenced.length === 0) orphaned.push(sidecarId);
		}
		return orphaned;
	}
	await Promise.all([
		command.result.deletedItemIds.length > 0
			? notifyWorkspaceRoom(env, {
					type: "workspace.items.deleted",
					workspaceId: input.workspaceId,
					revision: command.revision,
					itemIds: command.result.deletedItemIds,
				})
			: undefined,
		command.documentItemIds.length > 0 || command.fileItemIds.length > 0
			? requestWorkspaceItemCleanup(env, {
					workspaceId: input.workspaceId,
					documentItemIds: command.documentItemIds,
					fileItemIds: command.fileItemIds,
				})
			: undefined,
	]);
	return { revision: command.revision, result: command.result };
}

async function notifyWorkspaceItemsUpserted(
	env: Cloudflare.Env,
	workspaceId: string,
	items: WorkspaceItem[],
	revision: number,
) {
	await notifyWorkspaceRoom(env, {
		type: "workspace.items.upserted",
		workspaceId,
		revision,
		items,
	});
}
