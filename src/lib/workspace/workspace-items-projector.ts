import {
  db,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItemProjectionState,
  workspaceItemUserState,
  workspaceItems,
} from "@/lib/db/client";
import { and, asc, eq, inArray } from "drizzle-orm";
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

async function getWorkspaceProjectionCheckpoint(
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

function rehydrateProjectedItems(params: {
  shellRows: Array<typeof workspaceItems.$inferSelect>;
  contentRows: Array<typeof workspaceItemContent.$inferSelect>;
  extractedRows: Array<typeof workspaceItemExtracted.$inferSelect>;
  userStateRows: Array<typeof workspaceItemUserState.$inferSelect>;
}): Item[] {
  const contentByItemId = new Map(
    params.contentRows.map((row) => [row.itemId, row]),
  );
  const extractedByItemId = new Map(
    params.extractedRows.map((row) => [row.itemId, row]),
  );
  const userStatesByItemId = new Map<string, typeof params.userStateRows>();

  for (const row of params.userStateRows) {
    const rows = userStatesByItemId.get(row.itemId) ?? [];
    rows.push(row);
    userStatesByItemId.set(row.itemId, rows);
  }

  return params.shellRows.map((shellRow) =>
    rehydrateWorkspaceItem({
      shell: shellRow as any,
      content: contentByItemId.get(shellRow.itemId) as any,
      extracted: extractedByItemId.get(shellRow.itemId) as any,
      userStates: userStatesByItemId.get(shellRow.itemId)?.map((row) => ({
        stateKey: row.stateKey,
        stateType: row.stateType as Item["type"],
        stateSchemaVersion: row.stateSchemaVersion,
        state: row.state as Record<string, unknown>,
      })),
    }),
  );
}

async function loadProjectedItemsByShellRows(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  shellRows: Array<typeof workspaceItems.$inferSelect>,
  userId?: string | null,
): Promise<Item[]> {
  if (shellRows.length === 0) {
    return [];
  }

  const itemIds = shellRows.map((row) => row.itemId);

  const [contentRows, extractedRows, userStateRows] = await Promise.all([
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
      : Promise.resolve(
          [] as Array<typeof workspaceItemUserState.$inferSelect>,
        ),
  ]);

  return rehydrateProjectedItems({
    shellRows,
    contentRows: contentRows as Array<typeof workspaceItemContent.$inferSelect>,
    extractedRows: extractedRows as Array<
      typeof workspaceItemExtracted.$inferSelect
    >,
    userStateRows: userStateRows as Array<
      typeof workspaceItemUserState.$inferSelect
    >,
  });
}

async function loadProjectedItemsByIds(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  itemIds: string[],
  userId?: string | null,
): Promise<Item[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const shellRows = (await client
    .select()
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, workspaceId),
        inArray(workspaceItems.itemId, itemIds),
      ),
    )) as Array<typeof workspaceItems.$inferSelect>;

  const shellRowOrder = new Map(shellRows.map((row) => [row.itemId, row]));
  const orderedShellRows = itemIds
    .map((itemId) => shellRowOrder.get(itemId))
    .filter((row): row is typeof workspaceItems.$inferSelect => Boolean(row));

  return loadProjectedItemsByShellRows(
    client,
    workspaceId,
    orderedShellRows,
    userId,
  );
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
    getWorkspaceProjectionCheckpoint(client, workspaceId),
  ]);

  return {
    items: await loadProjectedItemsByShellRows(
      client,
      workspaceId,
      shellRows as Array<typeof workspaceItems.$inferSelect>,
      userId,
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

async function upsertProjectedItems(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    items: Item[];
    version: number;
    timestamp: number;
    userId?: string | null;
  },
): Promise<void> {
  for (const item of params.items) {
    await upsertProjectedItem(client, {
      workspaceId: params.workspaceId,
      item,
      version: params.version,
      timestamp: params.timestamp,
      userId: params.userId,
    });
  }
}

async function getFolderIds(
  client: WorkspaceProjectionClient,
  workspaceId: string,
  itemIds: string[],
): Promise<string[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const rows = await client
    .select({
      itemId: workspaceItems.itemId,
      type: workspaceItems.type,
    })
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, workspaceId),
        inArray(workspaceItems.itemId, itemIds),
      ),
    );

  return rows.filter((row) => row.type === "folder").map((row) => row.itemId);
}

async function clearProjectedFolderMembership(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    folderIds: string[];
    version: number;
    timestamp: number;
  },
): Promise<void> {
  if (params.folderIds.length === 0) {
    return;
  }

  await client
    .update(workspaceItems)
    .set({
      folderId: null,
      layout: null,
      sourceVersion: params.version,
      updatedAt: toIsoTimestamp(params.timestamp),
    })
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        inArray(workspaceItems.folderId, params.folderIds),
      ),
    );
}

async function moveProjectedItemsToFolder(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    itemIds: string[];
    folderId: string | null;
    version: number;
    timestamp: number;
    touchLastModified?: boolean;
  },
): Promise<void> {
  if (params.itemIds.length === 0) {
    return;
  }

  await client
    .update(workspaceItems)
    .set({
      folderId: params.folderId,
      layout: null,
      sourceVersion: params.version,
      ...(params.touchLastModified ? { lastModified: params.timestamp } : {}),
      updatedAt: toIsoTimestamp(params.timestamp),
    })
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        inArray(workspaceItems.itemId, params.itemIds),
      ),
    );
}

async function updateProjectedLayouts(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    layoutUpdates: NonNullable<
      Extract<
        WorkspaceEvent,
        { type: "BULK_ITEMS_UPDATED" }
      >["payload"]["layoutUpdates"]
    >;
    version: number;
    timestamp: number;
  },
): Promise<void> {
  for (const layoutUpdate of params.layoutUpdates) {
    await client
      .update(workspaceItems)
      .set({
        layout: {
          x: layoutUpdate.x,
          y: layoutUpdate.y,
          w: layoutUpdate.w,
          h: layoutUpdate.h,
        },
        sourceVersion: params.version,
        updatedAt: toIsoTimestamp(params.timestamp),
      })
      .where(
        and(
          eq(workspaceItems.workspaceId, params.workspaceId),
          eq(workspaceItems.itemId, layoutUpdate.id),
        ),
      );
  }
}

async function applyReducerProjectionForItemIds(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    itemIds: string[];
    event: WorkspaceEvent;
    version: number;
  },
): Promise<void> {
  if (params.itemIds.length === 0) {
    return;
  }

  const currentItems = await loadProjectedItemsByIds(
    client,
    params.workspaceId,
    params.itemIds,
    params.event.userId,
  );
  const projectedEvent = { ...params.event, version: params.version };
  const nextItems = eventReducer(currentItems, projectedEvent);
  const { deletedItemIds, upsertedItems } = diffProjectedItems(
    currentItems,
    nextItems,
  );

  await deleteProjectedItems(client, params.workspaceId, deletedItemIds);
  await upsertProjectedItems(client, {
    workspaceId: params.workspaceId,
    items: upsertedItems,
    version: params.version,
    timestamp: params.event.timestamp,
    userId: params.event.userId,
  });
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
  const eventWithVersion = {
    ...params.event,
    version: params.version,
  } as WorkspaceEvent;

  switch (eventWithVersion.type) {
    case "ITEM_CREATED": {
      await upsertProjectedItem(client, {
        workspaceId: params.workspaceId,
        item: {
          ...eventWithVersion.payload.item,
          lastModified: eventWithVersion.timestamp,
        },
        version: params.version,
        timestamp: eventWithVersion.timestamp,
        userId: eventWithVersion.userId,
      });
      break;
    }

    case "BULK_ITEMS_CREATED": {
      await upsertProjectedItems(client, {
        workspaceId: params.workspaceId,
        items: eventWithVersion.payload.items.map((item) => ({
          ...item,
          lastModified: eventWithVersion.timestamp,
        })),
        version: params.version,
        timestamp: eventWithVersion.timestamp,
        userId: eventWithVersion.userId,
      });
      break;
    }

    case "ITEM_UPDATED": {
      await applyReducerProjectionForItemIds(client, {
        workspaceId: params.workspaceId,
        itemIds: [eventWithVersion.payload.id],
        event: eventWithVersion,
        version: params.version,
      });
      break;
    }

    case "BULK_ITEMS_PATCHED": {
      await applyReducerProjectionForItemIds(client, {
        workspaceId: params.workspaceId,
        itemIds: eventWithVersion.payload.updates.map((update) => update.id),
        event: eventWithVersion,
        version: params.version,
      });
      break;
    }

    case "ITEM_DELETED": {
      const folderIds = await getFolderIds(client, params.workspaceId, [
        eventWithVersion.payload.id,
      ]);
      await clearProjectedFolderMembership(client, {
        workspaceId: params.workspaceId,
        folderIds,
        version: params.version,
        timestamp: eventWithVersion.timestamp,
      });
      await deleteProjectedItems(client, params.workspaceId, [
        eventWithVersion.payload.id,
      ]);
      break;
    }

    case "BULK_ITEMS_UPDATED": {
      if (eventWithVersion.payload.deletedIds?.length) {
        const deletedIds = eventWithVersion.payload.deletedIds;
        const folderIds = await getFolderIds(
          client,
          params.workspaceId,
          deletedIds,
        );
        await clearProjectedFolderMembership(client, {
          workspaceId: params.workspaceId,
          folderIds,
          version: params.version,
          timestamp: eventWithVersion.timestamp,
        });
        await deleteProjectedItems(client, params.workspaceId, deletedIds);
        break;
      }

      if (eventWithVersion.payload.addedItems?.length) {
        await upsertProjectedItems(client, {
          workspaceId: params.workspaceId,
          items: eventWithVersion.payload.addedItems.map((item) => ({
            ...item,
            lastModified: eventWithVersion.timestamp,
          })),
          version: params.version,
          timestamp: eventWithVersion.timestamp,
          userId: eventWithVersion.userId,
        });
        break;
      }

      if (eventWithVersion.payload.layoutUpdates?.length) {
        await updateProjectedLayouts(client, {
          workspaceId: params.workspaceId,
          layoutUpdates: eventWithVersion.payload.layoutUpdates,
          version: params.version,
          timestamp: eventWithVersion.timestamp,
        });
      }
      break;
    }

    case "ITEM_MOVED_TO_FOLDER": {
      await moveProjectedItemsToFolder(client, {
        workspaceId: params.workspaceId,
        itemIds: [eventWithVersion.payload.itemId],
        folderId: eventWithVersion.payload.folderId,
        version: params.version,
        timestamp: eventWithVersion.timestamp,
      });
      break;
    }

    case "ITEMS_MOVED_TO_FOLDER": {
      await moveProjectedItemsToFolder(client, {
        workspaceId: params.workspaceId,
        itemIds: eventWithVersion.payload.itemIds,
        folderId: eventWithVersion.payload.folderId,
        version: params.version,
        timestamp: eventWithVersion.timestamp,
      });
      break;
    }

    case "FOLDER_CREATED_WITH_ITEMS": {
      await upsertProjectedItem(client, {
        workspaceId: params.workspaceId,
        item: {
          ...eventWithVersion.payload.folder,
          lastModified: eventWithVersion.timestamp,
        },
        version: params.version,
        timestamp: eventWithVersion.timestamp,
        userId: eventWithVersion.userId,
      });
      await moveProjectedItemsToFolder(client, {
        workspaceId: params.workspaceId,
        itemIds: eventWithVersion.payload.itemIds,
        folderId: eventWithVersion.payload.folder.id,
        version: params.version,
        timestamp: eventWithVersion.timestamp,
        touchLastModified: true,
      });
      break;
    }
  }

  await upsertProjectionCheckpoint(client, params.workspaceId, params.version);
}

export async function projectWorkspaceEvent(
  client: WorkspaceProjectionClient,
  params: {
    workspaceId: string;
    event: WorkspaceEvent;
    version: number;
  },
): Promise<void> {
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
