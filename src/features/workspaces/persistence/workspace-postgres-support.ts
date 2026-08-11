import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import {
	workspaceFileAssets,
	workspaceItemPages,
	workspaceItemExtractions,
	workspaceItemRelations,
	workspaceItems,
	workspaces,
} from "#/db/schema";
import { createDbContext } from "#/db/server";
import type {
	JsonValue,
	WorkspaceItemFacts,
	WorkspaceItemSummary,
	WorkspaceItemType,
} from "#/features/workspaces/contracts";
import { workspaceItemTypeSchema } from "#/features/workspaces/contracts";
import {
	getAvailableWorkspaceItemName,
	getWorkspaceItemNameKey,
	getWorkspaceItemTypeMeta,
	normalizeWorkspaceItemName,
	WORKSPACE_ITEM_SORT_STEP,
} from "#/features/workspaces/defaults";
import type {
	CreateWorkspaceKernelFileFromUploadArgs,
	ReadWorkspaceFileExtractionResult,
	WorkspaceKernelNameConflict,
	WorkspaceKernelNameConflictPolicy,
} from "#/features/workspaces/kernel/workspace-kernel-types";
import { assertCanMutateWorkspace } from "#/features/workspaces/server/permissions";

export type Database = Awaited<ReturnType<typeof createDbContext>>["db"];
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type QueryExecutor = Database | Transaction;
export type ItemRow = typeof workspaceItems.$inferSelect;

export async function withWorkspaceDatabase<T>(run: (db: Database) => Promise<T>) {
	const context = await createDbContext();
	try {
		return await run(context.db);
	} finally {
		await context.dispose();
	}
}

export async function withWorkspaceTransaction<T>(run: (transaction: Transaction) => Promise<T>) {
	return await withWorkspaceDatabase((db) => db.transaction(run));
}

export async function lockWorkspaceForActor(
	transaction: Transaction,
	workspaceId: string,
	actorUserId: string | null | undefined,
) {
	const result = await transaction.execute(
		sql`select id from ${workspaces} where ${workspaces.id} = ${workspaceId} for update`,
	);
	if (result.rowCount === 0) throw new Error("Workspace not found.");
	if (actorUserId) {
		await assertCanMutateWorkspace(transaction, { workspaceId, userId: actorUserId });
	}
}

export async function nextWorkspaceRevision(transaction: Transaction, workspaceId: string) {
	const [workspace] = await transaction
		.update(workspaces)
		.set({ revision: sql`${workspaces.revision} + 1`, updatedAt: new Date() })
		.where(eq(workspaces.id, workspaceId))
		.returning({ revision: workspaces.revision });
	if (!workspace) throw new Error("Workspace not found.");
	return workspace.revision;
}

export async function getActiveWorkspaceItemRows(db: QueryExecutor, workspaceId: string) {
	return await db
		.select()
		.from(workspaceItems)
		.where(eq(workspaceItems.workspaceId, workspaceId))
		.orderBy(asc(workspaceItems.parentId), asc(workspaceItems.sortOrder), asc(workspaceItems.name));
}

export async function getActiveWorkspaceItems(db: QueryExecutor, workspaceId: string) {
	return (await getActiveWorkspaceItemRows(db, workspaceId)).map(mapWorkspaceItem);
}

export async function getActiveWorkspaceItemRow(
	db: QueryExecutor,
	workspaceId: string,
	itemId: string,
) {
	const [row] = await db
		.select()
		.from(workspaceItems)
		.where(and(eq(workspaceItems.workspaceId, workspaceId), eq(workspaceItems.id, itemId)))
		.limit(1);
	if (row) return row;

	const [legacyRow] = await db
		.select()
		.from(workspaceItems)
		.where(
			and(
				eq(workspaceItems.workspaceId, workspaceId),
				sql`${workspaceItems.metadata}->>'legacyItemId' = ${itemId}`,
			),
		)
		.limit(1);
	return legacyRow ?? null;
}

export async function requireActiveWorkspaceItemRow(
	db: QueryExecutor,
	workspaceId: string,
	itemId: string,
) {
	const row = await getActiveWorkspaceItemRow(db, workspaceId, itemId);
	if (!row) throw new Error("Workspace item not found.");
	return row;
}

export async function requireActiveWorkspaceItem(
	db: QueryExecutor,
	workspaceId: string,
	itemId: string,
) {
	return mapWorkspaceItem(await requireActiveWorkspaceItemRow(db, workspaceId, itemId));
}

export async function getWorkspaceItemsByIds(
	db: QueryExecutor,
	workspaceId: string,
	itemIds: string[],
) {
	if (itemIds.length === 0) return [];
	const rows = await db
		.select()
		.from(workspaceItems)
		.where(and(eq(workspaceItems.workspaceId, workspaceId), inArray(workspaceItems.id, itemIds)));
	const byId = new Map(rows.map((row) => [row.id, mapWorkspaceItem(row)]));
	return itemIds.flatMap((id) => {
		const item = byId.get(id);
		return item ? [item] : [];
	});
}

export async function getWorkspaceItemFacts(
	db: QueryExecutor,
	workspaceId: string,
	items: WorkspaceItemSummary[],
): Promise<WorkspaceItemFacts[]> {
	if (items.length === 0) return [];
	const itemIds = items.map((item) => item.id);
	const [relations, projections, pageCounts] = await Promise.all([
		db
			.select({
				fromItemId: workspaceItemRelations.fromItemId,
				toItemId: workspaceItemRelations.toItemId,
			})
			.from(workspaceItemRelations)
			.where(
				and(
					eq(workspaceItemRelations.workspaceId, workspaceId),
					or(
						inArray(workspaceItemRelations.fromItemId, itemIds),
						inArray(workspaceItemRelations.toItemId, itemIds),
					),
				),
			),
		db
			.select({
				itemId: workspaceItemExtractions.itemId,
				metadata: workspaceItemExtractions.metadata,
			})
			.from(workspaceItemExtractions)
			.where(
				and(
					eq(workspaceItemExtractions.workspaceId, workspaceId),
					inArray(workspaceItemExtractions.itemId, itemIds),
					eq(workspaceItemExtractions.status, "ready"),
				),
			),
		db
			.select({
				itemId: workspaceItemPages.itemId,
				pageCount: sql<number>`count(*)::int`,
			})
			.from(workspaceItemPages)
			.where(inArray(workspaceItemPages.itemId, itemIds))
			.groupBy(workspaceItemPages.itemId),
	]);
	const relationCounts = new Map<string, number>();
	for (const relation of relations) {
		relationCounts.set(relation.fromItemId, (relationCounts.get(relation.fromItemId) ?? 0) + 1);
		if (relation.toItemId !== relation.fromItemId) {
			relationCounts.set(relation.toItemId, (relationCounts.get(relation.toItemId) ?? 0) + 1);
		}
	}
	const countsByItem = new Map(pageCounts.map((row) => [row.itemId, row.pageCount]));
	for (const projection of projections) {
		if (countsByItem.has(projection.itemId)) continue;
		const count = toWorkspaceMetadata(projection.metadata).pageCount;
		if (typeof count === "number" && Number.isInteger(count) && count > 0) {
			countsByItem.set(projection.itemId, count);
		}
	}
	return items.map((item) => ({
		itemId: item.id,
		...(countsByItem.get(item.id) ? { pageCount: countsByItem.get(item.id) } : {}),
		relationshipCount: relationCounts.get(item.id) ?? 0,
	}));
}

export async function assertWorkspaceParentIsValid(
	db: QueryExecutor,
	workspaceId: string,
	parentId: string | null,
) {
	if (!parentId) return;
	const parent = await requireActiveWorkspaceItemRow(db, workspaceId, parentId);
	if (parent.type !== "folder") throw new Error("Items can only be moved into folders.");
}

export async function getNextWorkspaceSortOrder(
	db: QueryExecutor,
	workspaceId: string,
	parentId: string | null,
) {
	const parentCondition = parentId
		? eq(workspaceItems.parentId, parentId)
		: isNull(workspaceItems.parentId);
	const [row] = await db
		.select({ maximum: sql<number | null>`max(${workspaceItems.sortOrder})` })
		.from(workspaceItems)
		.where(and(eq(workspaceItems.workspaceId, workspaceId), parentCondition));
	return (row?.maximum ?? 0) + WORKSPACE_ITEM_SORT_STEP;
}

export async function resolveWorkspaceItemName(
	db: QueryExecutor,
	workspaceId: string,
	input: {
		itemId?: string;
		type: WorkspaceItemType;
		parentId: string | null;
		requestedName?: string;
		excludeItemId?: string;
		onNameConflict?: WorkspaceKernelNameConflictPolicy;
		reservedNames?: string[];
	},
): Promise<
	| { name: string; status: "resolved" }
	| { conflict: WorkspaceKernelNameConflict; status: "conflict" }
> {
	const siblingCondition = input.parentId
		? eq(workspaceItems.parentId, input.parentId)
		: isNull(workspaceItems.parentId);
	const siblings = await db
		.select({ id: workspaceItems.id, name: workspaceItems.name })
		.from(workspaceItems)
		.where(and(eq(workspaceItems.workspaceId, workspaceId), siblingCondition));
	const existingNames = [
		...siblings.filter((row) => row.id !== input.excludeItemId).map((row) => row.name),
		...(input.reservedNames ?? []),
	];
	if (input.onNameConflict === "error") {
		const name = input.requestedName ? normalizeWorkspaceItemName(input.requestedName, "") : "";
		if (
			!name ||
			existingNames.some(
				(existing) => getWorkspaceItemNameKey(existing) === getWorkspaceItemNameKey(name),
			)
		) {
			return {
				status: "conflict",
				conflict: {
					code: "name_conflict",
					itemId: input.itemId ?? null,
					requestedName: name || input.requestedName?.trim() || null,
				},
			};
		}
		return { name, status: "resolved" };
	}
	return {
		status: "resolved",
		name: getAvailableWorkspaceItemName({
			type: input.type,
			requestedName: input.requestedName,
			existingNames,
		}),
	};
}

export async function requireWorkspaceFileAsset(db: QueryExecutor, itemId: string) {
	const [asset] = await db
		.select()
		.from(workspaceFileAssets)
		.where(eq(workspaceFileAssets.itemId, itemId))
		.limit(1);
	if (!asset) throw new Error("Workspace file source is missing.");
	return asset;
}

export function mapWorkspaceItem(row: ItemRow): WorkspaceItemSummary {
	const type = workspaceItemTypeSchema.parse(row.type);
	return {
		id: row.id,
		workspaceId: row.workspaceId,
		parentId: row.parentId,
		type,
		title: row.name,
		name: row.name,
		meta: getWorkspaceItemTypeMeta(type),
		color: row.color,
		metadataJson: toWorkspaceMetadata(row.metadata),
		sortOrder: row.sortOrder,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		deletedAt: null,
	};
}

export function mapWorkspaceExtraction(row: typeof workspaceItemExtractions.$inferSelect) {
	return {
		itemId: row.itemId,
		status: row.status,
		provider: row.provider,
		providerMode: row.providerMode,
		errorMessage: row.errorMessage,
		sourceHash: row.sourceHash,
		metadataJson: toWorkspaceMetadata(row.metadata),
		updatedAt: row.updatedAt.toISOString(),
	} satisfies ReadWorkspaceFileExtractionResult;
}

export function toWorkspaceMetadata(value: Record<string, unknown>): Record<string, JsonValue> {
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, JsonValue] => isJsonValue(entry[1])),
	);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return true;
	if (Array.isArray(value)) return value.every(isJsonValue);
	return typeof value === "object" && value !== null && Object.values(value).every(isJsonValue);
}

export function createCompatibleFileMetadata(input: {
	assetKind: CreateWorkspaceKernelFileFromUploadArgs["assetKind"];
	contentType: string;
	originalName: string;
	sizeBytes: number;
	source?: CreateWorkspaceKernelFileFromUploadArgs["source"];
}): Record<string, JsonValue> {
	return {
		assetKind: input.assetKind,
		mimeType: input.contentType,
		originalName: input.originalName,
		sizeBytes: input.sizeBytes,
		...(input.source
			? {
					source: {
						conversion: input.source.conversion,
						name: input.source.fileName,
						mimeType: input.source.mimeType,
						sizeBytes: input.source.sizeBytes,
					},
				}
			: {}),
	};
}

export function hasSelectedAncestor(
	row: ItemRow,
	selected: ReadonlySet<string>,
	rowsById: ReadonlyMap<string, ItemRow>,
) {
	const seen = new Set([row.id]);
	let parentId = row.parentId;
	while (parentId) {
		if (selected.has(parentId)) return true;
		if (seen.has(parentId)) return false;
		seen.add(parentId);
		parentId = rowsById.get(parentId)?.parentId ?? null;
	}
	return false;
}

export function isDescendantOf(
	itemId: string | null,
	ancestorId: string,
	rowsById: ReadonlyMap<string, ItemRow>,
) {
	let currentId = itemId;
	const seen = new Set<string>();
	while (currentId) {
		if (currentId === ancestorId) return true;
		if (seen.has(currentId)) return false;
		seen.add(currentId);
		currentId = rowsById.get(currentId)?.parentId ?? null;
	}
	return false;
}

export function collectDescendants(rootIds: string[], rows: ItemRow[]) {
	const children = new Map<string, string[]>();
	for (const row of rows) {
		if (!row.parentId) continue;
		const childIds = children.get(row.parentId) ?? [];
		childIds.push(row.id);
		children.set(row.parentId, childIds);
	}
	const result: string[] = [];
	const queue = [...rootIds];
	const seen = new Set<string>();
	for (let index = 0; index < queue.length; index += 1) {
		const id = queue[index];
		if (!id || seen.has(id)) continue;
		seen.add(id);
		result.push(id);
		queue.push(...(children.get(id) ?? []));
	}
	return result;
}
