import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  type Database,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItemProjectionState,
  workspaceItems,
  workspaceItemUserState,
} from "@/lib/db/client";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import {
  buildWorkspaceItemProjection,
  normalizeItem,
  normalizeItems,
  rehydrateItemData,
  type WorkspaceItemUserState as WorkspaceItemUserStatePayload,
} from "@/lib/workspace/workspace-item-model";
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
  const normalized = normalizeItem(item);
  return JSON.stringify({
    id: normalized.id,
    type: normalized.type,
    name: normalized.name,
    subtitle: normalized.subtitle,
    data: normalized.data ?? null,
    color: normalizeNullable(normalized.color),
    folderId: normalizeNullable(normalized.folderId),
    layout: normalizeNullable(normalized.layout),
    lastModified: normalized.lastModified ?? null,
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

type ProjectionCoreRow = {
  itemId: string;
  type: string;
  name: string;
  subtitle: string;
  data: unknown;
  color: string | null;
  folderId: string | null;
  layout: unknown;
  lastModified: number | null;
};

type ProjectionContentRow = {
  itemId: string;
  textContent: string | null;
  structuredData: unknown;
  assetData: unknown;
  embedData: unknown;
  sourceData: unknown;
};

type ProjectionExtractedRow = {
  itemId: string;
  contentPreview: string | null;
  ocrText: string | null;
  transcriptText: string | null;
  ocrPages: unknown;
  transcriptSegments: unknown;
};

type ProjectionUserStateRow = {
  itemId: string;
  state: WorkspaceItemUserStatePayload;
};

function projectionRowToItem(
  row: ProjectionCoreRow,
  contentRow?: ProjectionContentRow,
  extractedRow?: ProjectionExtractedRow,
  userStateRow?: ProjectionUserStateRow,
): Item {
  return normalizeItem({
    id: row.itemId,
    type: row.type as Item["type"],
    name: row.name,
    subtitle: row.subtitle,
    data: rehydrateItemData(
      row.type as Item["type"],
      row.data,
      contentRow
        ? {
            textContent: contentRow.textContent,
            structuredData: contentRow.structuredData,
            assetData: contentRow.assetData,
            embedData: contentRow.embedData,
            sourceData: contentRow.sourceData,
          }
        : null,
      extractedRow
        ? {
            contentPreview: extractedRow.contentPreview,
            ocrText: extractedRow.ocrText,
            transcriptText: extractedRow.transcriptText,
            ocrPages: extractedRow.ocrPages,
            transcriptSegments: extractedRow.transcriptSegments,
          }
        : null,
      userStateRow?.state ?? null,
    ),
    ...(row.color ? { color: row.color as Item["color"] } : {}),
    ...(row.folderId ? { folderId: row.folderId } : {}),
    ...(row.layout ? { layout: row.layout as Item["layout"] } : {}),
    ...(typeof row.lastModified === "number"
      ? { lastModified: row.lastModified }
      : {}),
  });
}

function normalizeSharedProjectedItem(item: Item): Item {
  const projection = buildWorkspaceItemProjection(item);
  return normalizeItem({
    ...item,
    data: rehydrateItemData(
      item.type,
      projection.data,
      projection.content,
      projection.extracted,
      null,
    ),
  });
}

async function overlayUserStateOnItems(
  workspaceId: string,
  items: Item[],
  currentUserId: string | null,
): Promise<Item[]> {
  if (!currentUserId || items.length === 0) {
    return items;
  }

  const rows = await db
    .select({
      itemId: workspaceItemUserState.itemId,
      state: workspaceItemUserState.state,
    })
    .from(workspaceItemUserState)
    .where(
      and(
        eq(workspaceItemUserState.workspaceId, workspaceId),
        eq(workspaceItemUserState.userId, currentUserId),
      ),
    );

  if (rows.length === 0) {
    return items;
  }

  const stateByItemId = new Map<string, WorkspaceItemUserStatePayload>(
    rows.map((row) => [row.itemId, row.state as WorkspaceItemUserStatePayload]),
  );

  return items.map((item) => {
    const userState = stateByItemId.get(item.id);
    if (!userState) {
      return item;
    }

    return normalizeItem({
      ...item,
      data: rehydrateItemData(item.type, item.data, null, null, userState),
    });
  });
}

function itemToProjectionRows(
  workspaceId: string,
  item: Item,
  sourceVersion: number,
  userId: string | null,
) {
  const projection = buildWorkspaceItemProjection(item);
  const updatedAt = new Date().toISOString();

  return {
    coreRow: {
      workspaceId,
      itemId: item.id,
      type: item.type,
      name: item.name,
      subtitle: item.subtitle,
      data: projection.data,
      dataSchemaVersion: projection.dataSchemaVersion,
      color: item.color ?? null,
      folderId: item.folderId ?? null,
      layout: item.layout ?? null,
      lastModified: item.lastModified ?? null,
      sourceVersion,
      contentHash: projection.contentHash,
      sourceCount: projection.sourceCount,
      hasOcr: projection.hasOcr,
      ocrStatus: projection.ocrStatus,
      ocrPageCount: projection.ocrPageCount,
      hasTranscript: projection.hasTranscript,
      processingStatus: projection.processingStatus,
      updatedAt,
    },
    contentRow: {
      workspaceId,
      itemId: item.id,
      dataSchemaVersion: projection.dataSchemaVersion,
      contentHash: projection.contentHash,
      textContent: projection.content.textContent,
      structuredData: projection.content.structuredData,
      assetData: projection.content.assetData,
      embedData: projection.content.embedData,
      sourceData: projection.content.sourceData,
      updatedAt,
    },
    extractedRow: {
      workspaceId,
      itemId: item.id,
      searchText: projection.extracted.searchText,
      contentPreview: projection.extracted.contentPreview,
      ocrText: projection.extracted.ocrText,
      transcriptText: projection.extracted.transcriptText,
      ocrPages: projection.extracted.ocrPages,
      transcriptSegments: projection.extracted.transcriptSegments,
      updatedAt,
    },
    userStateRow: projection.userState && userId
      ? {
          workspaceId,
          itemId: item.id,
          userId,
          state: projection.userState,
          updatedAt,
        }
      : null,
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
  currentUserId: string | null = null,
): Promise<Item[]> {
  const [coreRows, contentRows, extractedRows, userStateRows] = await Promise.all([
    executor
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
      .orderBy(asc(workspaceItems.itemId)),
    executor
      .select({
        itemId: workspaceItemContent.itemId,
        textContent: workspaceItemContent.textContent,
        structuredData: workspaceItemContent.structuredData,
        assetData: workspaceItemContent.assetData,
        embedData: workspaceItemContent.embedData,
        sourceData: workspaceItemContent.sourceData,
      })
      .from(workspaceItemContent)
      .where(eq(workspaceItemContent.workspaceId, workspaceId)),
    executor
      .select({
        itemId: workspaceItemExtracted.itemId,
        contentPreview: workspaceItemExtracted.contentPreview,
        ocrText: workspaceItemExtracted.ocrText,
        transcriptText: workspaceItemExtracted.transcriptText,
        ocrPages: workspaceItemExtracted.ocrPages,
        transcriptSegments: workspaceItemExtracted.transcriptSegments,
      })
      .from(workspaceItemExtracted)
      .where(eq(workspaceItemExtracted.workspaceId, workspaceId)),
    currentUserId
      ? executor
          .select({
            itemId: workspaceItemUserState.itemId,
            state: workspaceItemUserState.state,
          })
          .from(workspaceItemUserState)
          .where(
            and(
              eq(workspaceItemUserState.workspaceId, workspaceId),
              eq(workspaceItemUserState.userId, currentUserId),
            ),
          )
      : Promise.resolve([]),
  ]);

  const contentById = new Map(contentRows.map((row) => [row.itemId, row]));
  const extractedById = new Map(extractedRows.map((row) => [row.itemId, row]));
  const userStateById = new Map<string, ProjectionUserStateRow>(
    userStateRows.map((row) => [
      row.itemId,
      {
        itemId: row.itemId,
        state: row.state as WorkspaceItemUserStatePayload,
      },
    ]),
  );

  return coreRows.map((row) =>
    projectionRowToItem(
      row,
      contentById.get(row.itemId),
      extractedById.get(row.itemId),
      userStateById.get(row.itemId),
    ),
  );
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
  currentUserId: string | null = null,
): Promise<Item[]> {
  if (await isProjectionCurrent(workspaceId)) {
    return loadProjectedWorkspaceItems(workspaceId, db, currentUserId);
  }

  const state = await loadWorkspaceState(workspaceId);
  return overlayUserStateOnItems(workspaceId, state.items, currentUserId);
}

export async function loadWorkspaceItemsState(
  workspaceId: string,
  currentUserId: string | null = null,
): Promise<Pick<WorkspaceState, "items">> {
  return {
    items: await loadWorkspaceItems(workspaceId, currentUserId),
  };
}

export async function loadWorkspaceCurrentState(
  workspaceId: string,
  currentUserId: string | null = null,
): Promise<WorkspaceState> {
  return {
    ...initialState,
    workspaceId,
    items: await loadWorkspaceItems(workspaceId, currentUserId),
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

  return normalizeItems(eventReducer(previousState, event).items);
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
  eventUserId: string | null,
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
    return [itemToProjectionRows(workspaceId, item, sourceVersion, eventUserId)];
  });

  if (changedProjectionRows.length === 0) {
    return;
  }

  await executor
    .insert(workspaceItems)
    .values(changedProjectionRows.map((row) => row.coreRow))
    .onConflictDoUpdate({
      target: [workspaceItems.workspaceId, workspaceItems.itemId],
      set: {
        type: sql`excluded.type`,
        name: sql`excluded.name`,
        subtitle: sql`excluded.subtitle`,
        data: sql`excluded.data`,
        dataSchemaVersion: sql`excluded.data_schema_version`,
        color: sql`excluded.color`,
        folderId: sql`excluded.folder_id`,
        layout: sql`excluded.layout`,
        lastModified: sql`excluded.last_modified`,
        sourceVersion: sql`excluded.source_version`,
        contentHash: sql`excluded.content_hash`,
        sourceCount: sql`excluded.source_count`,
        hasOcr: sql`excluded.has_ocr`,
        ocrStatus: sql`excluded.ocr_status`,
        ocrPageCount: sql`excluded.ocr_page_count`,
        hasTranscript: sql`excluded.has_transcript`,
        processingStatus: sql`excluded.processing_status`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  await executor
    .insert(workspaceItemContent)
    .values(changedProjectionRows.map((row) => row.contentRow))
    .onConflictDoUpdate({
      target: [workspaceItemContent.workspaceId, workspaceItemContent.itemId],
      set: {
        dataSchemaVersion: sql`excluded.data_schema_version`,
        contentHash: sql`excluded.content_hash`,
        textContent: sql`excluded.text_content`,
        structuredData: sql`excluded.structured_data`,
        assetData: sql`excluded.asset_data`,
        embedData: sql`excluded.embed_data`,
        sourceData: sql`excluded.source_data`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  await executor
    .insert(workspaceItemExtracted)
    .values(changedProjectionRows.map((row) => row.extractedRow))
    .onConflictDoUpdate({
      target: [workspaceItemExtracted.workspaceId, workspaceItemExtracted.itemId],
      set: {
        searchText: sql`excluded.search_text`,
        contentPreview: sql`excluded.content_preview`,
        ocrText: sql`excluded.ocr_text`,
        transcriptText: sql`excluded.transcript_text`,
        ocrPages: sql`excluded.ocr_pages`,
        transcriptSegments: sql`excluded.transcript_segments`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  const userStateRows = changedProjectionRows.flatMap((row) =>
    row.userStateRow ? [row.userStateRow] : [],
  );
  if (userStateRows.length > 0) {
    await executor
      .insert(workspaceItemUserState)
      .values(userStateRows)
      .onConflictDoUpdate({
        target: [
          workspaceItemUserState.workspaceId,
          workspaceItemUserState.itemId,
          workspaceItemUserState.userId,
        ],
        set: {
          state: sql`excluded.state`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  const itemIdsWithoutUserState = changedProjectionRows
    .filter((row) => !row.userStateRow)
    .map((row) => row.coreRow.itemId);
  if (itemIdsWithoutUserState.length > 0 && eventUserId) {
    await executor
      .delete(workspaceItemUserState)
      .where(
        and(
          eq(workspaceItemUserState.workspaceId, workspaceId),
          eq(workspaceItemUserState.userId, eventUserId),
          inArray(workspaceItemUserState.itemId, itemIdsWithoutUserState),
        ),
      );
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

  const previousItems = await loadProjectedWorkspaceItems(
    workspaceId,
    executor,
    event.userId ?? null,
  );
  const nextItems = applyEventToProjectedItems(previousItems, workspaceId, event);

  await syncProjectedItems(
    workspaceId,
    previousItems,
    nextItems,
    event.version,
    event.userId ?? null,
    executor,
  );
  await upsertProjectionCheckpoint(workspaceId, event.version, executor);
}

/**
 * Rebuild projection tables from the replayed event stream (e.g. after undo).
 * Preserves per-user `workspace_item_user_state` rows except for items removed
 * (CASCADE deletes those with the item row).
 */
export async function rebuildWorkspaceItemsProjectionFromEvents(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<{ workspaceId: string; version: number; itemCount: number }> {
  const [state, version, previousItems] = await Promise.all([
    loadWorkspaceState(workspaceId, executor),
    getWorkspaceEventVersion(workspaceId, executor),
    loadProjectedWorkspaceItems(workspaceId, executor, null),
  ]);

  const nextItems = normalizeItems(state.items);

  await executor.transaction(async (tx: DbExecutor) => {
    await syncProjectedItems(
      workspaceId,
      previousItems,
      nextItems,
      version,
      null,
      tx,
    );
    await upsertProjectionCheckpoint(workspaceId, version, tx);
  });

  return {
    workspaceId,
    version,
    itemCount: nextItems.length,
  };
}
