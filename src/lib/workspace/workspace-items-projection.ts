import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  type Database,
  workspaceItemProjectionState,
  workspaceItems,
  workspaces,
} from "@/lib/db/client";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { eventReducer } from "@/lib/workspace/event-reducer";
import { initialState } from "@/lib/workspace-state/state";
import type { Item, WorkspaceState } from "@/lib/workspace-state/types";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";

/** DB or Drizzle transaction (same ops used by projection; not only `typeof db`). */
type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function normalizeNullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function serializeComparableItem(item: Item) {
  return JSON.stringify({
    id: item.id,
    type: item.type,
    name: item.name,
    subtitle: item.subtitle,
    data: item.data ?? null,
    color: normalizeNullable(item.color),
    folderId: normalizeNullable(item.folderId),
    layout: normalizeNullable(item.layout),
    lastModified: item.lastModified ?? null,
  });
}

function itemsEqual(left: Item | undefined, right: Item | undefined): boolean {
  if (!left || !right) return false;
  return serializeComparableItem(left) === serializeComparableItem(right);
}

export function didProjectedItemChange(
  previousItem: Item | undefined,
  nextItem: Item,
): boolean {
  if (!previousItem) return true;
  return !itemsEqual(previousItem, nextItem);
}

function projectionRowToItem(row: {
  itemId: string;
  type: string;
  name: string;
  subtitle: string;
  data: unknown;
  color: string | null;
  folderId: string | null;
  layout: unknown;
  lastModified: number | null;
}): Item {
  return {
    id: row.itemId,
    type: row.type as Item["type"],
    name: row.name,
    subtitle: row.subtitle,
    data: row.data as Item["data"],
    ...(row.color ? { color: row.color as Item["color"] } : {}),
    ...(row.folderId ? { folderId: row.folderId } : {}),
    ...(row.layout ? { layout: row.layout as Item["layout"] } : {}),
    ...(typeof row.lastModified === "number"
      ? { lastModified: row.lastModified }
      : {}),
  };
}

function itemToProjectionRow(
  workspaceId: string,
  item: Item,
  sourceVersion: number,
) {
  return {
    workspaceId,
    itemId: item.id,
    type: item.type,
    name: item.name,
    subtitle: item.subtitle,
    data: item.data,
    color: item.color ?? null,
    folderId: item.folderId ?? null,
    layout: item.layout ?? null,
    lastModified: item.lastModified ?? null,
    sourceVersion,
    updatedAt: new Date().toISOString(),
  };
}

async function getWorkspaceProjectionVersion(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number | null> {
  const [state] = await executor
    .select({
      lastAppliedVersion: workspaceItemProjectionState.lastAppliedVersion,
    })
    .from(workspaceItemProjectionState)
    .where(eq(workspaceItemProjectionState.workspaceId, workspaceId))
    .limit(1);

  return state?.lastAppliedVersion ?? null;
}

export async function getWorkspaceEventVersion(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const result = await executor.execute(sql`
    SELECT get_workspace_version(${workspaceId}::uuid) as version
  `);

  const version = Number(result[0]?.version ?? 0);
  return Number.isFinite(version) ? version : 0;
}

export async function loadProjectedWorkspaceItems(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<Item[]> {
  const rows = await executor
    .select({
      itemId: workspaceItems.itemId,
      type: workspaceItems.type,
      name: workspaceItems.name,
      subtitle: workspaceItems.subtitle,
      data: workspaceItems.data,
      color: workspaceItems.color,
      folderId: workspaceItems.folderId,
      layout: workspaceItems.layout,
      lastModified: workspaceItems.lastModified,
    })
    .from(workspaceItems)
    .where(eq(workspaceItems.workspaceId, workspaceId))
    .orderBy(asc(workspaceItems.itemId));

  return rows.map(projectionRowToItem);
}

async function isProjectionCurrent(workspaceId: string): Promise<boolean> {
  const [projectionVersion, currentVersion] = await Promise.all([
    getWorkspaceProjectionVersion(workspaceId),
    getWorkspaceEventVersion(workspaceId),
  ]);

  return projectionVersion !== null && projectionVersion === currentVersion;
}

export async function loadWorkspaceItems(
  workspaceId: string,
): Promise<Item[]> {
  if (await isProjectionCurrent(workspaceId)) {
    return loadProjectedWorkspaceItems(workspaceId);
  }

  const state = await loadWorkspaceState(workspaceId);
  return state.items;
}

export async function loadWorkspaceItemsState(
  workspaceId: string,
): Promise<Pick<WorkspaceState, "items">> {
  return {
    items: await loadWorkspaceItems(workspaceId),
  };
}

export async function loadWorkspaceCurrentState(
  workspaceId: string,
): Promise<WorkspaceState> {
  return {
    ...initialState,
    workspaceId,
    items: await loadWorkspaceItems(workspaceId),
  };
}

export function applyEventToProjectedItems(
  previousItems: Item[],
  workspaceId: string,
  event: WorkspaceEvent,
): Item[] {
  const previousState: WorkspaceState = {
    ...initialState,
    workspaceId,
    items: previousItems,
  };

  return eventReducer(previousState, event).items;
}

async function upsertProjectionCheckpoint(
  workspaceId: string,
  version: number,
  executor: DbExecutor = db,
) {
  await executor
    .insert(workspaceItemProjectionState)
    .values({
      workspaceId,
      lastAppliedVersion: version,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: workspaceItemProjectionState.workspaceId,
      set: {
        lastAppliedVersion: version,
        updatedAt: new Date().toISOString(),
      },
    });
}

async function syncProjectedItems(
  workspaceId: string,
  previousItems: Item[],
  nextItems: Item[],
  sourceVersion: number,
  executor: DbExecutor = db,
) {
  const previousItemsById = new Map(previousItems.map((item) => [item.id, item]));
  const previousIds = new Set(previousItems.map((item) => item.id));
  const nextIds = new Set(nextItems.map((item) => item.id));

  const deletedIds = [...previousIds].filter((itemId) => !nextIds.has(itemId));
  if (deletedIds.length > 0) {
    await executor
      .delete(workspaceItems)
      .where(
        and(
          eq(workspaceItems.workspaceId, workspaceId),
          inArray(workspaceItems.itemId, deletedIds),
        ),
      );
  }

  const changedProjectionRows = nextItems.flatMap((item) => {
    const previousItem = previousItemsById.get(item.id);

    if (!didProjectedItemChange(previousItem, item)) {
      return [];
    }

    return [
      itemToProjectionRow(
        workspaceId,
        item,
        sourceVersion,
      ),
    ];
  });

  if (changedProjectionRows.length > 0) {
    await executor
      .insert(workspaceItems)
      .values(changedProjectionRows)
      .onConflictDoUpdate({
        target: [workspaceItems.workspaceId, workspaceItems.itemId],
        set: {
          type: sql`excluded.type`,
          name: sql`excluded.name`,
          subtitle: sql`excluded.subtitle`,
          data: sql`excluded.data`,
          color: sql`excluded.color`,
          folderId: sql`excluded.folder_id`,
          layout: sql`excluded.layout`,
          lastModified: sql`excluded.last_modified`,
          sourceVersion: sql`excluded.source_version`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}

export async function projectWorkspaceEvent(
  workspaceId: string,
  event: WorkspaceEvent,
  executor: DbExecutor = db,
): Promise<void> {
  if (typeof event.version !== "number") {
    throw new Error(
      `Cannot project workspace event ${event.id} without a persisted version`,
    );
  }

  const previousItems = await loadProjectedWorkspaceItems(workspaceId, executor);
  const nextItems = applyEventToProjectedItems(previousItems, workspaceId, event);

  await syncProjectedItems(
    workspaceId,
    previousItems,
    nextItems,
    event.version,
    executor,
  );
  await upsertProjectionCheckpoint(workspaceId, event.version, executor);
}

export async function backfillWorkspaceItemsProjection(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<{ workspaceId: string; version: number; itemCount: number }> {
  const [state, version] = await Promise.all([
    loadWorkspaceState(workspaceId),
    getWorkspaceEventVersion(workspaceId, executor),
  ]);

  await executor.transaction(async (tx: DbExecutor) => {
    await tx
      .delete(workspaceItems)
      .where(eq(workspaceItems.workspaceId, workspaceId));

    if (state.items.length > 0) {
      await tx.insert(workspaceItems).values(
        state.items.map((item) => itemToProjectionRow(workspaceId, item, version)),
      );
    }

    await upsertProjectionCheckpoint(workspaceId, version, tx);
  });

  return {
    workspaceId,
    version,
    itemCount: state.items.length,
  };
}

export async function backfillAllWorkspaceItemsProjection(): Promise<{
  workspaceCount: number;
  totalItems: number;
}> {
  const rows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .orderBy(asc(workspaces.id));

  let totalItems = 0;
  for (const row of rows) {
    const result = await backfillWorkspaceItemsProjection(row.id);
    totalItems += result.itemCount;
  }

  return {
    workspaceCount: rows.length,
    totalItems,
  };
}

export async function reconcileWorkspaceItemsProjection(workspaceId: string): Promise<{
  matches: boolean;
  replayedCount: number;
  projectedCount: number;
  missingItemIds: string[];
  extraItemIds: string[];
  mismatchedItemIds: string[];
}> {
  const [replayedState, projectedItems] = await Promise.all([
    loadWorkspaceState(workspaceId),
    loadProjectedWorkspaceItems(workspaceId),
  ]);

  const replayedMap = new Map(replayedState.items.map((item) => [item.id, item]));
  const projectedMap = new Map(projectedItems.map((item) => [item.id, item]));

  const missingItemIds = replayedState.items
    .filter((item) => !projectedMap.has(item.id))
    .map((item) => item.id);
  const extraItemIds = projectedItems
    .filter((item) => !replayedMap.has(item.id))
    .map((item) => item.id);
  const mismatchedItemIds = replayedState.items
    .filter((item) => {
      const projected = projectedMap.get(item.id);
      return projected && !itemsEqual(item, projected);
    })
    .map((item) => item.id);

  return {
    matches:
      missingItemIds.length === 0 &&
      extraItemIds.length === 0 &&
      mismatchedItemIds.length === 0,
    replayedCount: replayedState.items.length,
    projectedCount: projectedItems.length,
    missingItemIds,
    extraItemIds,
    mismatchedItemIds,
  };
}
