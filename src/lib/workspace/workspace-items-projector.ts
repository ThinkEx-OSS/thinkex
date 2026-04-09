import {
  db,
  workspaceEvents,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItemProjectionState,
  workspaceItemUserState,
  workspaceItems,
} from "@/lib/db/client";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Item } from "@/lib/workspace-state/types";
import { eventReducer } from "./event-reducer";
import type { WorkspaceEvent } from "./events";
import {
  buildWorkspaceItemTableRows,
  normalizeItem,
  rehydrateWorkspaceItem,
} from "./workspace-item-model";
import { stableStringify } from "./workspace-item-model-shared";

export type WorkspaceProjectionClient = Pick<
  typeof db,
  "delete" | "execute" | "insert" | "select" | "update"
>;

export interface WorkspaceProjectionSnapshot {
  items: Item[];
  version: number;
}

function toIsoTimestamp(timestamp: number | undefined): string {
  return new Date(timestamp ?? Date.now()).toISOString();
}

function mapEventRowToWorkspaceEvent(
  row: typeof workspaceEvents.$inferSelect,
): WorkspaceEvent {
  return {
    type: row.eventType as WorkspaceEvent["type"],
    payload: row.payload as WorkspaceEvent["payload"],
    timestamp: row.timestamp,
    userId: row.userId,
    userName: row.userName ?? undefined,
    id: row.eventId,
    version: row.version,
  } as WorkspaceEvent;
}

async function getProjectionCheckpoint(
  client: WorkspaceProjectionClient,
  workspaceId: string,
): Promise<number> {
  const [row] = await client
    .select({
      lastAppliedVersion: workspaceItemProjectionState.lastAppliedVersion,
    })
    .from(workspaceItemProjectionState)
    .where(eq(workspaceItemProjectionState.workspaceId, workspaceId))
    .limit(1);

  return row?.lastAppliedVersion ?? 0;
}

export async function getLatestWorkspaceEventVersion(
  client: WorkspaceProjectionClient,
  workspaceId: string,
): Promise<number> {
  const [row] = await client
    .select({
      version: sql<number>`coalesce(max(${workspaceEvents.version}), 0)::int`,
    })
    .from(workspaceEvents)
    .where(eq(workspaceEvents.workspaceId, workspaceId));

  return Number(row?.version ?? 0);
}

async function upsertProjectionCheckpoint(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  version: number,
): Promise<void> {
  await client
    .insert(workspaceItemProjectionState)
    .values({
      workspaceId,
      lastAppliedVersion: version,
      createdAt: new Date().toISOString(),
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

async function readProjectedWorkspaceState(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  userId?: string | null,
): Promise<WorkspaceProjectionSnapshot> {
  const [shellRows, version] = await Promise.all([
    client
      .select()
      .from(workspaceItems)
      .where(eq(workspaceItems.workspaceId, workspaceId))
      .orderBy(asc(workspaceItems.createdAt), asc(workspaceItems.itemId)),
    getProjectionCheckpoint(client, workspaceId),
  ]);

  if (shellRows.length === 0) {
    return { items: [], version };
  }

  const itemIds = shellRows.map((row: any) => row.itemId);

  const [rawContentRows, rawExtractedRows, rawUserStateRows] =
    await Promise.all([
      client
        .select()
        .from(workspaceItemContent)
        .where(
          and(
            eq(workspaceItemContent.workspaceId, workspaceId),
            inArray(workspaceItemContent.itemId, itemIds),
          ),
        ),
      client
        .select()
        .from(workspaceItemExtracted)
        .where(
          and(
            eq(workspaceItemExtracted.workspaceId, workspaceId),
            inArray(workspaceItemExtracted.itemId, itemIds),
          ),
        ),
      userId
        ? client
            .select()
            .from(workspaceItemUserState)
            .where(
              and(
                eq(workspaceItemUserState.workspaceId, workspaceId),
                eq(workspaceItemUserState.userId, userId),
                inArray(workspaceItemUserState.itemId, itemIds),
              ),
            )
        : Promise.resolve([] as (typeof workspaceItemUserState.$inferSelect)[]),
    ]);

  const contentRows = rawContentRows as Array<
    typeof workspaceItemContent.$inferSelect
  >;
  const extractedRows = rawExtractedRows as Array<
    typeof workspaceItemExtracted.$inferSelect
  >;
  const userStateRows = rawUserStateRows as Array<
    typeof workspaceItemUserState.$inferSelect
  >;

  const contentByItemId = new Map(
    contentRows.map((row: any) => [row.itemId, row]),
  );
  const extractedByItemId = new Map(
    extractedRows.map((row: any) => [row.itemId, row]),
  );
  const userStatesByItemId = new Map<
    string,
    (typeof workspaceItemUserState.$inferSelect)[]
  >();

  for (const row of userStateRows) {
    const rows = userStatesByItemId.get(row.itemId) ?? [];
    rows.push(row);
    userStatesByItemId.set(row.itemId, rows);
  }

  return {
    items: shellRows.map((shellRow: any) =>
      rehydrateWorkspaceItem({
        shell: shellRow,
        content: contentByItemId.get(shellRow.itemId),
        extracted: extractedByItemId.get(shellRow.itemId),
        userStates: userStatesByItemId.get(shellRow.itemId)?.map((row) => ({
          stateKey: row.stateKey,
          stateType: row.stateType as Item["type"],
          stateSchemaVersion: row.stateSchemaVersion,
          state: row.state as Record<string, unknown>,
        })),
      }),
    ),
    version,
  };
}

function diffProjectedItems(previousItems: Item[], nextItems: Item[]) {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const nextIds = new Set(nextItems.map((item) => item.id));

  const deletedItemIds = previousItems
    .filter((item) => !nextIds.has(item.id))
    .map((item) => item.id);

  const upsertedItems = nextItems.filter((item) => {
    const previous = previousById.get(item.id);
    if (!previous) {
      return true;
    }

    return (
      stableStringify(normalizeItem(previous)) !==
      stableStringify(normalizeItem(item))
    );
  });

  return { deletedItemIds, upsertedItems };
}

async function deleteProjectedItems(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) {
    return;
  }

  await client
    .delete(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, workspaceId),
        inArray(workspaceItems.itemId, itemIds),
      ),
    );
}

async function replaceProjectedUserState(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  itemId: string,
  userId: string,
  rows: ReturnType<typeof buildWorkspaceItemTableRows>["userStates"],
): Promise<void> {
  await client
    .delete(workspaceItemUserState)
    .where(
      and(
        eq(workspaceItemUserState.workspaceId, workspaceId),
        eq(workspaceItemUserState.itemId, itemId),
        eq(workspaceItemUserState.userId, userId),
      ),
    );

  if (rows.length === 0) {
    return;
  }

  for (const row of rows) {
    await client.insert(workspaceItemUserState).values({
      workspaceId: row.workspaceId,
      itemId: row.itemId,
      userId: row.userId,
      stateKey: row.stateKey,
      stateType: row.stateType,
      stateSchemaVersion: row.stateSchemaVersion,
      state: row.state,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function upsertProjectedItem(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    item: Item;
    version: number;
    timestamp: number;
    userId?: string | null;
  },
): Promise<void> {
  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item: params.item,
    sourceVersion: params.version,
    userId: params.userId ?? undefined,
  });
  const timestamp = toIsoTimestamp(params.timestamp);

  await client
    .insert(workspaceItems)
    .values({
      ...rows.item,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [workspaceItems.workspaceId, workspaceItems.itemId],
      set: {
        type: rows.item.type,
        name: rows.item.name,
        subtitle: rows.item.subtitle,
        color: rows.item.color,
        folderId: rows.item.folderId,
        layout: rows.item.layout,
        lastModified: rows.item.lastModified,
        sourceVersion: rows.item.sourceVersion,
        dataSchemaVersion: rows.item.dataSchemaVersion,
        contentHash: rows.item.contentHash,
        processingStatus: rows.item.processingStatus,
        hasOcr: rows.item.hasOcr,
        ocrStatus: rows.item.ocrStatus,
        ocrPageCount: rows.item.ocrPageCount,
        hasTranscript: rows.item.hasTranscript,
        sourceCount: rows.item.sourceCount,
        updatedAt: timestamp,
      },
    });

  await client
    .insert(workspaceItemContent)
    .values({
      ...rows.content,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [workspaceItemContent.workspaceId, workspaceItemContent.itemId],
      set: {
        dataSchemaVersion: rows.content.dataSchemaVersion,
        contentHash: rows.content.contentHash,
        textContent: rows.content.textContent,
        structuredData: rows.content.structuredData,
        assetData: rows.content.assetData,
        embedData: rows.content.embedData,
        sourceData: rows.content.sourceData,
        updatedAt: timestamp,
      },
    });

  await client
    .insert(workspaceItemExtracted)
    .values({
      ...rows.extracted,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        workspaceItemExtracted.workspaceId,
        workspaceItemExtracted.itemId,
      ],
      set: {
        searchText: rows.extracted.searchText,
        contentPreview: rows.extracted.contentPreview,
        ocrText: rows.extracted.ocrText,
        transcriptText: rows.extracted.transcriptText,
        ocrPages: rows.extracted.ocrPages,
        transcriptSegments: rows.extracted.transcriptSegments,
        updatedAt: timestamp,
      },
    });

  if (params.userId) {
    await replaceProjectedUserState(
      client,
      params.workspaceId,
      params.item.id,
      params.userId,
      rows.userStates,
    );
  }
}

export function deriveWorkspaceProjectionChangeSet(
  currentItems: Item[],
  event: WorkspaceEvent,
) {
  const nextItems = eventReducer(currentItems, event);
  const { deletedItemIds, upsertedItems } = diffProjectedItems(
    currentItems,
    nextItems,
  );

  return {
    nextItems,
    deletedItemIds,
    upsertedItems,
  };
}

async function applyWorkspaceEventProjectionInternal(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    event: WorkspaceEvent;
    version: number;
  },
): Promise<void> {
  const currentState = await readProjectedWorkspaceState(
    client,
    params.workspaceId,
    params.event.userId,
  );
  const { deletedItemIds, upsertedItems } = deriveWorkspaceProjectionChangeSet(
    currentState.items,
    {
      ...params.event,
      version: params.version,
    },
  );

  await deleteProjectedItems(client, params.workspaceId, deletedItemIds);

  for (const item of upsertedItems) {
    await upsertProjectedItem(client, {
      workspaceId: params.workspaceId,
      item,
      version: params.version,
      timestamp: params.event.timestamp,
      userId: params.event.userId,
    });
  }

  await upsertProjectionCheckpoint(client, params.workspaceId, params.version);
}

export async function syncWorkspaceProjectionToVersion(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  targetVersion: number,
): Promise<number> {
  if (targetVersion <= 0) {
    await upsertProjectionCheckpoint(client, workspaceId, 0);
    return 0;
  }

  const currentCheckpoint = await getProjectionCheckpoint(client, workspaceId);
  if (currentCheckpoint >= targetVersion) {
    return currentCheckpoint;
  }

  const eventRows = await client
    .select()
    .from(workspaceEvents)
    .where(
      and(
        eq(workspaceEvents.workspaceId, workspaceId),
        gt(workspaceEvents.version, currentCheckpoint),
        lte(workspaceEvents.version, targetVersion),
      ),
    )
    .orderBy(asc(workspaceEvents.version));

  let lastAppliedVersion = currentCheckpoint;

  for (const row of eventRows) {
    await applyWorkspaceEventProjectionInternal(client, {
      workspaceId,
      event: mapEventRowToWorkspaceEvent(row),
      version: row.version,
    });
    lastAppliedVersion = row.version;
  }

  if (lastAppliedVersion === 0) {
    await upsertProjectionCheckpoint(client, workspaceId, 0);
  }

  return Math.max(lastAppliedVersion, currentCheckpoint);
}

export async function projectWorkspaceEvent(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    event: WorkspaceEvent;
    version: number;
  },
): Promise<void> {
  await syncWorkspaceProjectionToVersion(
    client,
    params.workspaceId,
    params.version - 1,
  );
  await applyWorkspaceEventProjectionInternal(client, params);
}

export async function loadWorkspaceProjectionSnapshot(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    userId?: string | null;
  },
): Promise<WorkspaceProjectionSnapshot> {
  return readProjectedWorkspaceState(client, params.workspaceId, params.userId);
}
