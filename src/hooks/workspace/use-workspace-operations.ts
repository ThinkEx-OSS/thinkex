import { useCallback, useEffect, useRef } from "react";
import { useZero } from "@rocicorp/zero/react";
import { Debouncer } from "@tanstack/pacer/debouncer";
import { toast } from "sonner";
import type {
  Item,
  ItemData,
  CardType,
  DocumentData,
} from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import { defaultDataFor } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import { mutators } from "@/lib/zero/mutators";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  hasDuplicateName,
  getNextUniqueDefaultName,
} from "@/lib/workspace/unique-name";
import { filterItemIdsForFolderCreation } from "@/lib/workspace-state/search";
import {
  getWorkspaceItemLane,
  sortWorkspaceItemsByOrder,
} from "@/lib/workspace-state/order";
import {
  sanitizeWorkspaceItemChanges,
  sanitizeWorkspaceItemForPersistence,
} from "@/lib/workspace/workspace-item-sanitize";

const ITEM_UPDATE_DEBOUNCE_MS = 500;

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type WorkspaceItemMutatorChanges = {
  name?: string;
  subtitle?: string;
  data?: JsonObject;
  color?: string | null;
  folderId?: string | null;
  sortOrder?: number | null;
  layout?: JsonObject | null;
  lastModified?: number;
};

function getAllDescendantIds(folderId: string, items: Item[]): string[] {
  const directChildren = items.filter((item) => item.folderId === folderId);
  const descendantIds: string[] = [];

  for (const child of directChildren) {
    descendantIds.push(child.id);
    if (child.type === "folder") {
      descendantIds.push(...getAllDescendantIds(child.id, items));
    }
  }

  return descendantIds;
}

function getNextSortOrderForItem(
  items: Item[],
  item: Pick<Item, "type" | "folderId">,
): number {
  const siblings = items.filter(
    (candidate) =>
      getWorkspaceItemLane(candidate) === getWorkspaceItemLane(item) &&
      (candidate.folderId ?? null) === (item.folderId ?? null),
  );
  const maxSortOrder = siblings.reduce<number>(
    (max, candidate) =>
      candidate.sortOrder == null ? max : Math.max(max, candidate.sortOrder),
    -1,
  );

  return Math.max(maxSortOrder + 1, siblings.length);
}

function toMutatorChanges(changes: Partial<Item>): WorkspaceItemMutatorChanges {
  const sanitized = sanitizeWorkspaceItemChanges(changes);
  const mutatorChanges: WorkspaceItemMutatorChanges = {};

  if (sanitized.name !== undefined) {
    mutatorChanges.name = sanitized.name;
  }
  if (sanitized.subtitle !== undefined) {
    mutatorChanges.subtitle = sanitized.subtitle;
  }
  if (sanitized.data !== undefined) {
    mutatorChanges.data = sanitized.data as JsonObject;
  }
  if (sanitized.color !== undefined) {
    mutatorChanges.color = sanitized.color ?? null;
  }
  if (sanitized.folderId !== undefined) {
    mutatorChanges.folderId = sanitized.folderId ?? null;
  }
  if (sanitized.sortOrder !== undefined) {
    mutatorChanges.sortOrder = sanitized.sortOrder ?? null;
  }
  if (sanitized.layout !== undefined) {
    mutatorChanges.layout =
      (sanitized.layout as JsonObject | undefined) ?? null;
  }
  if (sanitized.lastModified !== undefined) {
    mutatorChanges.lastModified = sanitized.lastModified;
  }

  return mutatorChanges;
}

function isEmptyChanges(changes: WorkspaceItemMutatorChanges): boolean {
  return Object.keys(changes).length === 0;
}

/**
 * Return type for workspace operations
 */
export interface WorkspaceOperations {
  createItem: (
    type: CardType,
    name?: string,
    initialData?: Partial<Item["data"]>,
  ) => string;
  createItems: (
    items: Array<{
      type: CardType;
      name?: string;
      initialData?: Partial<Item["data"]>;
    }>,
    options?: { showSuccessToast?: boolean },
  ) => string[];
  updateItem: (id: string, changes: Partial<Item>) => void;
  updateItemData: (
    itemId: string,
    updater: (prev: Item["data"]) => Item["data"],
  ) => void;
  deleteItem: (id: string) => void;
  updateAllItems: (items: Item[]) => void;
  flushPendingChanges: (itemId: string) => void;
  getDocumentMarkdownForExport: (itemId: string) => string;
  createFolder: (name: string, color?: CardColor) => string;
  createFolderWithItems: (
    name: string,
    itemIds: string[],
    color?: CardColor,
  ) => string;
  updateFolder: (folderId: string, changes: Partial<Item>) => void;
  deleteFolder: (folderId: string) => void;
  deleteFolderWithContents: (folderId: string) => void;
  moveItemToFolder: (itemId: string, folderId: string | null) => void;
  moveItemsToFolder: (itemIds: string[], folderId: string | null) => void;
  reorderItems: (orderedItemIds: string[]) => void;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

export function useWorkspaceOperations(
  workspaceId: string | null,
  currentItems: Item[],
): WorkspaceOperations {
  const zero = useZero();

  const workspaceIdRef = useRef(workspaceId);
  const currentItemsRef = useRef(currentItems);
  const zeroRef = useRef(zero);

  const updateItemDebouncerRef = useRef<Map<string, Debouncer<() => void>>>(
    new Map(),
  );
  const updateItemDataDebouncerRef = useRef<Map<string, Debouncer<() => void>>>(
    new Map(),
  );
  const pendingItemChangesRef = useRef<Map<string, Partial<Item>>>(new Map());
  const pendingItemDataUpdatersRef = useRef<
    Map<string, (prev: Item["data"]) => Item["data"]>
  >(new Map());
  const commitPendingItemUpdateRef = useRef<(itemId: string) => void>(() => {});
  const commitPendingItemDataUpdateRef = useRef<(itemId: string) => void>(
    () => {},
  );

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    currentItemsRef.current = currentItems;
  }, [currentItems]);

  useEffect(() => {
    zeroRef.current = zero;
  }, [zero]);

  const getLatestItemsFromState = useCallback(
    () => currentItemsRef.current,
    [],
  );

  const getLatestItemFromState = useCallback(
    (itemId: string) =>
      getLatestItemsFromState().find((item) => item.id === itemId),
    [getLatestItemsFromState],
  );

  const getLatestItemWithPendingChanges = useCallback(
    (itemId: string) => {
      const item = getLatestItemFromState(itemId);
      if (!item) return undefined;

      const pendingChanges = pendingItemChangesRef.current.get(itemId);
      const itemWithPendingChanges = pendingChanges
        ? ({ ...item, ...pendingChanges } as Item)
        : item;

      const pendingUpdater = pendingItemDataUpdatersRef.current.get(itemId);
      if (!pendingUpdater) {
        return itemWithPendingChanges;
      }

      return {
        ...itemWithPendingChanges,
        data: pendingUpdater(itemWithPendingChanges.data),
      };
    },
    [getLatestItemFromState],
  );

  const commitPendingItemUpdate = useCallback(
    (itemId: string) => {
      const finalChanges = pendingItemChangesRef.current.get(itemId);
      if (!finalChanges) {
        updateItemDebouncerRef.current.delete(itemId);
        return;
      }

      const currentWorkspaceId = workspaceIdRef.current;
      const latestItems = getLatestItemsFromState();
      const item = latestItems.find((candidate) => candidate.id === itemId);
      if (!item) {
        pendingItemChangesRef.current.delete(itemId);
        updateItemDebouncerRef.current.delete(itemId);
        return;
      }

      const newName = finalChanges.name ?? item.name;
      const newType = finalChanges.type ?? item.type;
      const folderId = finalChanges.folderId ?? item.folderId ?? null;

      if (newName && newType && "name" in finalChanges) {
        if (hasDuplicateName(latestItems, newName, newType, folderId, itemId)) {
          toast.error(
            `A ${newType} named "${newName}" already exists in this folder`,
          );
          pendingItemChangesRef.current.delete(itemId);
          updateItemDebouncerRef.current.delete(itemId);
          return;
        }
      }

      const changes = toMutatorChanges(finalChanges);
      if (!currentWorkspaceId || isEmptyChanges(changes)) {
        pendingItemChangesRef.current.delete(itemId);
        updateItemDebouncerRef.current.delete(itemId);
        return;
      }

      zeroRef.current.mutate(
        mutators.item.update({
          workspaceId: currentWorkspaceId,
          id: itemId,
          changes,
        }),
      );

      pendingItemChangesRef.current.delete(itemId);
      updateItemDebouncerRef.current.delete(itemId);
    },
    [getLatestItemsFromState],
  );

  const commitPendingItemDataUpdate = useCallback(
    (itemId: string) => {
      const finalUpdater = pendingItemDataUpdatersRef.current.get(itemId);
      if (!finalUpdater) {
        updateItemDataDebouncerRef.current.delete(itemId);
        return;
      }

      const currentWorkspaceId = workspaceIdRef.current;
      const latestItem = getLatestItemFromState(itemId);
      if (!latestItem) {
        logger.warn(
          `[OCR/UPDATE] updateItemData: Item ${itemId} not found. Item may have been deleted.`,
          {
            itemId,
            workspaceId: currentWorkspaceId,
          },
        );
        pendingItemDataUpdatersRef.current.delete(itemId);
        updateItemDataDebouncerRef.current.delete(itemId);
        return;
      }

      const newData = sanitizeWorkspaceItemForPersistence({
        ...latestItem,
        data: finalUpdater(latestItem.data),
      }).data;

      if (currentWorkspaceId) {
        zeroRef.current.mutate(
          mutators.item.update({
            workspaceId: currentWorkspaceId,
            id: itemId,
            changes: { data: newData as JsonObject },
          }),
        );
      }

      pendingItemDataUpdatersRef.current.delete(itemId);
      updateItemDataDebouncerRef.current.delete(itemId);
    },
    [getLatestItemFromState],
  );

  useEffect(() => {
    commitPendingItemUpdateRef.current = commitPendingItemUpdate;
  }, [commitPendingItemUpdate]);

  useEffect(() => {
    commitPendingItemDataUpdateRef.current = commitPendingItemDataUpdate;
  }, [commitPendingItemDataUpdate]);

  const getOrCreateUpdateItemDebouncer = useCallback((itemId: string) => {
    const existing = updateItemDebouncerRef.current.get(itemId);
    if (existing) {
      return existing;
    }

    const debouncer = new Debouncer(
      () => commitPendingItemUpdateRef.current(itemId),
      {
        wait: ITEM_UPDATE_DEBOUNCE_MS,
      },
    );
    updateItemDebouncerRef.current.set(itemId, debouncer);
    return debouncer;
  }, []);

  const getOrCreateUpdateItemDataDebouncer = useCallback((itemId: string) => {
    const existing = updateItemDataDebouncerRef.current.get(itemId);
    if (existing) {
      return existing;
    }

    const debouncer = new Debouncer(
      () => commitPendingItemDataUpdateRef.current(itemId),
      { wait: ITEM_UPDATE_DEBOUNCE_MS },
    );
    updateItemDataDebouncerRef.current.set(itemId, debouncer);
    return debouncer;
  }, []);

  useEffect(() => {
    const updateItemDebouncers = updateItemDebouncerRef.current;
    const updateItemDataDebouncers = updateItemDataDebouncerRef.current;
    const pendingItemChanges = pendingItemChangesRef.current;
    const pendingItemDataUpdaters = pendingItemDataUpdatersRef.current;

    return () => {
      updateItemDebouncers.forEach((debouncer) => debouncer.cancel());
      updateItemDataDebouncers.forEach((debouncer) => debouncer.cancel());
      updateItemDebouncers.clear();
      updateItemDataDebouncers.clear();
      pendingItemChanges.clear();
      pendingItemDataUpdaters.clear();
    };
  }, []);

  const createItem = useCallback(
    (type: CardType, name?: string, initialData?: Partial<Item["data"]>) => {
      const validTypes: CardType[] = [
        "pdf",
        "flashcard",
        "folder",
        "youtube",
        "quiz",
        "image",
        "audio",
        "website",
        "document",
      ];
      const validType = validTypes.includes(type) ? type : "document";
      const id = crypto.randomUUID();
      const activeFolderId = useUIStore.getState().activeFolderId;
      const folderId = activeFolderId ?? null;
      const finalName =
        name ||
        getNextUniqueDefaultName(currentItemsRef.current, validType, folderId);

      const baseData = defaultDataFor(validType);
      const mergedData = initialData
        ? { ...baseData, ...initialData }
        : baseData;
      const sortOrder = getNextSortOrderForItem(currentItemsRef.current, {
        type: validType,
        folderId: activeFolderId ?? undefined,
      });

      const item = sanitizeWorkspaceItemForPersistence({
        id,
        type: validType,
        name: finalName,
        subtitle: "",
        data: mergedData as ItemData,
        color: getRandomCardColor(),
        folderId: activeFolderId ?? undefined,
        sortOrder,
      });

      if (workspaceIdRef.current) {
        zeroRef.current.mutate(
          mutators.item.create({
            workspaceId: workspaceIdRef.current,
            id,
            item: {
              id: item.id,
              type: item.type,
              name: item.name,
              subtitle: item.subtitle,
              data: item.data as JsonObject,
              color: item.color ?? null,
              folderId: item.folderId ?? null,
              sortOrder: item.sortOrder ?? null,
            },
          }),
        );
      }

      return id;
    },
    [],
  );

  const createItems = useCallback(
    (
      items: Array<{
        type: CardType;
        name?: string;
        initialData?: Partial<Item["data"]>;
      }>,
      options?: { showSuccessToast?: boolean },
    ): string[] => {
      if (items.length === 0) {
        return [];
      }

      const activeFolderId = useUIStore.getState().activeFolderId;
      const itemsSoFar: Item[] = [];

      const createdItems: Item[] = items
        .map(({ type, name, initialData }) => {
          const validTypes: CardType[] = [
            "pdf",
            "flashcard",
            "folder",
            "youtube",
            "quiz",
            "image",
            "audio",
            "website",
            "document",
          ];
          const validType = validTypes.includes(type) ? type : "document";
          const id = crypto.randomUUID();
          const folderId = activeFolderId ?? null;
          const allItemsSoFar = [...currentItemsRef.current, ...itemsSoFar];
          const finalName =
            name ||
            getNextUniqueDefaultName(allItemsSoFar, validType, folderId);

          if (
            name &&
            hasDuplicateName(allItemsSoFar, finalName, validType, folderId)
          ) {
            return null;
          }

          const baseData = defaultDataFor(validType);
          const mergedData = initialData
            ? { ...baseData, ...initialData }
            : baseData;
          const sortOrder = getNextSortOrderForItem(
            [...currentItemsRef.current, ...itemsSoFar],
            {
              type: validType,
              folderId: activeFolderId ?? undefined,
            },
          );

          const newItem = sanitizeWorkspaceItemForPersistence({
            id,
            type: validType,
            name: finalName,
            subtitle: "",
            data: mergedData as ItemData,
            color: getRandomCardColor(),
            folderId: activeFolderId ?? undefined,
            sortOrder,
          });
          itemsSoFar.push(newItem);
          return newItem;
        })
        .filter((item): item is Item => item !== null);

      if (createdItems.length === 0) {
        toast.error("All items were skipped (duplicate names in folder)");
        return [];
      }

      if (createdItems.length < items.length) {
        toast.warning(
          `${items.length - createdItems.length} item(s) skipped due to duplicate names`,
        );
      }

      if (workspaceIdRef.current) {
        zeroRef.current.mutate(
          mutators.item.createMany({
            workspaceId: workspaceIdRef.current,
            items: createdItems.map((item) => ({
              id: item.id,
              type: item.type,
              name: item.name,
              subtitle: item.subtitle,
              data: item.data as JsonObject,
              color: item.color ?? null,
              folderId: item.folderId ?? null,
              sortOrder: item.sortOrder ?? null,
            })),
          }),
        );
      }

      if (options?.showSuccessToast !== false) {
        const itemCount = createdItems.length;
        toast.success(`${itemCount} card${itemCount === 1 ? "" : "s"} created`);
      }

      return createdItems.map((item) => item.id);
    },
    [],
  );

  const updateItem = useCallback(
    (id: string, changes: Partial<Item>) => {
      const existingPending = pendingItemChangesRef.current.get(id) || {};
      const mergedChanges = { ...existingPending, ...changes };
      pendingItemChangesRef.current.set(id, mergedChanges);
      getOrCreateUpdateItemDebouncer(id).maybeExecute();
    },
    [getOrCreateUpdateItemDebouncer],
  );

  const deleteItem = useCallback(async (id: string) => {
    const itemToDelete = currentItemsRef.current.find((item) => item.id === id);
    if (itemToDelete && itemToDelete.type === "pdf") {
      const pdfData = itemToDelete.data as {
        fileUrl?: string;
        filename?: string;
      };
      if (pdfData?.fileUrl) {
        try {
          const deleteResponse = await fetch(
            `/api/delete-file?url=${encodeURIComponent(pdfData.fileUrl)}`,
            {
              method: "DELETE",
            },
          );

          if (!deleteResponse.ok) {
            const errorData = await deleteResponse
              .json()
              .catch(() => ({ error: "Failed to delete file" }));
            logger.warn("Failed to delete PDF file:", errorData.error);
          }
        } catch (error) {
          logger.error("Error deleting PDF file:", error);
        }
      }
    }

    if (!workspaceIdRef.current) {
      return;
    }

    zeroRef.current.mutate(
      mutators.item.delete({
        workspaceId: workspaceIdRef.current,
        id,
        name: itemToDelete?.name,
      }),
    );
  }, []);

  const updateItemData = useCallback(
    (itemId: string, updater: (prev: Item["data"]) => Item["data"]) => {
      const existingUpdater = pendingItemDataUpdatersRef.current.get(itemId);
      if (existingUpdater) {
        pendingItemDataUpdatersRef.current.set(itemId, (prev: Item["data"]) =>
          updater(existingUpdater(prev)),
        );
      } else {
        pendingItemDataUpdatersRef.current.set(itemId, updater);
      }
      getOrCreateUpdateItemDataDebouncer(itemId).maybeExecute();
    },
    [getOrCreateUpdateItemDataDebouncer],
  );

  const updateAllItems = useCallback((items: Item[]) => {
    const currentWorkspaceId = workspaceIdRef.current;
    if (!currentWorkspaceId) {
      return;
    }

    const latestState = currentItemsRef.current;
    const previousItemCount = latestState.length;
    const currentIds = new Set(latestState.map((item) => item.id));
    const newIds = new Set(items.map((item) => item.id));

    if (items.length < previousItemCount) {
      const deletedIds = latestState
        .filter((item) => !newIds.has(item.id))
        .map((item) => item.id);
      if (deletedIds.length > 0) {
        zeroRef.current.mutate(
          mutators.item.updateMany({
            workspaceId: currentWorkspaceId,
            deletedIds,
            previousItemCount,
          }),
        );
      }
      return;
    }

    if (items.length > previousItemCount) {
      const addedItems = items
        .filter((item) => !currentIds.has(item.id))
        .map((item) => sanitizeWorkspaceItemForPersistence(item));

      if (addedItems.length > 0) {
        zeroRef.current.mutate(
          mutators.item.updateMany({
            workspaceId: currentWorkspaceId,
            addedItems: addedItems.map((item) => ({
              id: item.id,
              type: item.type,
              name: item.name,
              subtitle: item.subtitle,
              data: item.data as JsonObject,
              color: item.color ?? null,
              folderId: item.folderId ?? null,
              sortOrder: item.sortOrder ?? null,
            })),
            previousItemCount,
          }),
        );
      }
      return;
    }
  }, []);

  const createFolder = useCallback(
    (name: string, color?: CardColor): string => {
      const folderId = crypto.randomUUID();
      const activeFolderId = useUIStore.getState().activeFolderId;
      const sortOrder = getNextSortOrderForItem(currentItemsRef.current, {
        type: "folder",
        folderId: activeFolderId ?? undefined,
      });
      const folder = sanitizeWorkspaceItemForPersistence({
        id: folderId,
        type: "folder",
        name: name || "New Folder",
        subtitle: "",
        data: defaultDataFor("folder") as ItemData,
        color: color || getRandomCardColor(),
        folderId: activeFolderId ?? undefined,
        sortOrder,
      });

      if (workspaceIdRef.current) {
        zeroRef.current.mutate(
          mutators.item.create({
            workspaceId: workspaceIdRef.current,
            id: folderId,
            item: {
              id: folder.id,
              type: folder.type,
              name: folder.name,
              subtitle: folder.subtitle,
              data: folder.data as JsonObject,
              color: folder.color ?? null,
              folderId: folder.folderId ?? null,
              sortOrder: folder.sortOrder ?? null,
            },
          }),
        );
      }

      return folderId;
    },
    [],
  );

  const createFolderWithItems = useCallback(
    (name: string, itemIds: string[], color?: CardColor): string => {
      const activeFolderId = useUIStore.getState().activeFolderId;
      const safeItemIds = filterItemIdsForFolderCreation(
        itemIds,
        activeFolderId,
        getLatestItemsFromState() ?? [],
      );

      if (safeItemIds.length === 0) {
        toast.error(
          "Cannot create folder: selected items would create a circular reference.",
        );
        return "";
      }

      const folderId = crypto.randomUUID();
      const sortOrder = getNextSortOrderForItem(getLatestItemsFromState(), {
        type: "folder",
        folderId: activeFolderId ?? undefined,
      });
      const folder = sanitizeWorkspaceItemForPersistence({
        id: folderId,
        type: "folder",
        name: name || "New Folder",
        subtitle: "",
        data: defaultDataFor("folder") as ItemData,
        color: color || getRandomCardColor(),
        folderId: activeFolderId ?? undefined,
        sortOrder,
      });

      if (workspaceIdRef.current) {
        zeroRef.current.mutate(
          mutators.folder.createWithItems({
            workspaceId: workspaceIdRef.current,
            folder: {
              id: folder.id,
              type: "folder",
              name: folder.name,
              subtitle: folder.subtitle,
              data: folder.data as JsonObject,
              color: folder.color ?? null,
              folderId: folder.folderId ?? null,
              sortOrder: folder.sortOrder ?? null,
            },
            itemIds: safeItemIds,
          }),
        );
      }

      toast.success(
        `Folder created with ${safeItemIds.length} item${safeItemIds.length === 1 ? "" : "s"}`,
      );

      return folderId;
    },
    [getLatestItemsFromState],
  );

  const updateFolder = useCallback(
    (folderId: string, changes: Partial<Item>) => {
      updateItem(folderId, changes);
    },
    [updateItem],
  );

  const deleteFolder = useCallback(
    (folderId: string) => {
      const folder = currentItemsRef.current.find(
        (item) => item.id === folderId && item.type === "folder",
      );
      void deleteItem(folderId);
      toast.success(
        folder ? `Folder "${folder.name}" deleted` : "Folder deleted",
      );
    },
    [deleteItem],
  );

  const deleteFolderWithContents = useCallback(
    (folderId: string) => {
      const latestItems = getLatestItemsFromState();
      const folder = latestItems.find(
        (item) => item.id === folderId && item.type === "folder",
      );
      const allDescendantIds = getAllDescendantIds(folderId, latestItems);
      const idsToDelete = new Set([...allDescendantIds, folderId]);
      const itemCount = allDescendantIds.length;

      const itemsToDelete = latestItems.filter((item) =>
        idsToDelete.has(item.id),
      );
      for (const item of itemsToDelete) {
        if (item.type === "pdf") {
          const pdfData = item.data as { fileUrl?: string };
          if (pdfData?.fileUrl) {
            fetch(
              `/api/delete-file?url=${encodeURIComponent(pdfData.fileUrl)}`,
              {
                method: "DELETE",
              },
            ).catch(() => {});
          }
        }
      }

      const currentWorkspaceId = workspaceIdRef.current;
      if (currentWorkspaceId) {
        for (const descendantId of allDescendantIds) {
          zeroRef.current.mutate(
            mutators.item.delete({
              workspaceId: currentWorkspaceId,
              id: descendantId,
            }),
          );
        }
        zeroRef.current.mutate(
          mutators.item.delete({
            workspaceId: currentWorkspaceId,
            id: folderId,
            name: folder?.name,
          }),
        );
      }

      toast.success(
        folder
          ? `Folder "${folder.name}" and ${itemCount} ${itemCount === 1 ? "item" : "items"} deleted`
          : `Folder and ${itemCount} ${itemCount === 1 ? "item" : "items"} deleted`,
      );
    },
    [getLatestItemsFromState],
  );

  const moveItemToFolder = useCallback(
    (itemId: string, folderId: string | null) => {
      const currentWorkspaceId = workspaceIdRef.current;
      if (!currentWorkspaceId) {
        return;
      }

      const item = currentItemsRef.current.find(
        (candidate) => candidate.id === itemId,
      );
      zeroRef.current.mutate(
        mutators.item.move({
          workspaceId: currentWorkspaceId,
          itemId,
          folderId,
          itemName: item?.name,
        }),
      );
    },
    [],
  );

  const moveItemsToFolder = useCallback(
    (itemIds: string[], folderId: string | null) => {
      const currentWorkspaceId = workspaceIdRef.current;
      if (!currentWorkspaceId) {
        return;
      }

      const orderedItems = sortWorkspaceItemsByOrder(
        currentItemsRef.current.filter((item) => itemIds.includes(item.id)),
      );
      const orderedItemIds = orderedItems.map((item) => item.id);
      const itemNames = orderedItems
        .map((item) => item.name)
        .filter((name): name is string => name != null);

      zeroRef.current.mutate(
        mutators.item.moveMany({
          workspaceId: currentWorkspaceId,
          itemIds: orderedItemIds,
          folderId,
          itemNames,
        }),
      );
    },
    [],
  );

  const reorderItems = useCallback((orderedItemIds: string[]) => {
    const currentWorkspaceId = workspaceIdRef.current;
    if (!currentWorkspaceId || orderedItemIds.length === 0) {
      return;
    }

    zeroRef.current.mutate(
      mutators.item.reorder({
        workspaceId: currentWorkspaceId,
        updates: orderedItemIds.map((itemId, index) => ({
          itemId,
          sortOrder: index,
        })),
      }),
    );
  }, []);

  const flushPendingChanges = useCallback((itemId: string) => {
    updateItemDebouncerRef.current.get(itemId)?.flush();
    updateItemDataDebouncerRef.current.get(itemId)?.flush();
  }, []);

  const getDocumentMarkdownForExport = useCallback(
    (itemId: string) => {
      const item = getLatestItemWithPendingChanges(itemId);
      if (!item || item.type !== "document") return "";
      return (item.data as DocumentData).markdown ?? "";
    },
    [getLatestItemWithPendingChanges],
  );

  return {
    createItem,
    createItems,
    updateItem,
    updateItemData,
    deleteItem,
    updateAllItems,
    flushPendingChanges,
    getDocumentMarkdownForExport,
    createFolder,
    createFolderWithItems,
    updateFolder,
    deleteFolder,
    deleteFolderWithContents,
    moveItemToFolder,
    moveItemsToFolder,
    reorderItems,
    isPending: false,
    isError: false,
    error: null,
  };
}
