import { useCallback, useRef, useEffect } from "react";
import { Debouncer } from "@tanstack/pacer/debouncer";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "./use-workspace-mutation";
import { createEvent, type EventResponse } from "@/lib/workspace/events";
import { workspaceEventsQueryKey } from "./use-workspace-events";
import {
  deriveWorkspaceStateFromCaches,
  getCachedWorkspaceState,
} from "./workspace-state-cache";
import type {
  Item,
  ItemData,
  CardType,
  DocumentData,
} from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { defaultDataFor } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import { useUIStore } from "@/lib/stores/ui-store";
import {
  hasDuplicateName,
  getNextUniqueDefaultName,
} from "@/lib/workspace/unique-name";
import { filterItemIdsForFolderCreation } from "@/lib/workspace-state/search";

const ITEM_UPDATE_DEBOUNCE_MS = 500;

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

/**
 * Return type for workspace operations
 */
export interface WorkspaceOperations {
  createItem: (
    type: CardType,
    name?: string,
    initialData?: Partial<Item["data"]>,
    initialLayout?: { w: number; h: number },
  ) => string;
  createItems: (
    items: Array<{
      type: CardType;
      name?: string;
      initialData?: Partial<Item["data"]>;
      initialLayout?: { w: number; h: number };
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
  // Folder operations
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
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

/**
 * High-level workspace operations hook
 * Wraps useWorkspaceMutation with convenient methods for common operations
 * All operations emit events for optimistic updates
 */
export function useWorkspaceOperations(
  workspaceId: string | null,
  currentItems: Item[],
): WorkspaceOperations {
  const { data: session } = useSession();
  const user = session?.user;
  const queryClient = useQueryClient();

  const mutation = useWorkspaceMutation(workspaceId);

  const userId = user?.id || "anonymous";
  const userName = user?.name || user?.email || undefined;

  // Debouncer refs for updateItem and updateItemData keyed by item ID.
  const updateItemDebouncerRef = useRef<Map<string, Debouncer<() => void>>>(
    new Map(),
  );
  const updateItemDataDebouncerRef = useRef<Map<string, Debouncer<() => void>>>(
    new Map(),
  );
  // Store pending changes to merge them
  const pendingItemChangesRef = useRef<Map<string, Partial<Item>>>(new Map());
  const pendingItemDataUpdatersRef = useRef<
    Map<string, (prev: Item["data"]) => Item["data"]>
  >(new Map());

  const getLatestItemsFromState = useCallback(() => {
    if (!workspaceId) {
      return currentItems;
    }

    const stateData = getCachedWorkspaceState(queryClient, workspaceId);
    const eventData = queryClient.getQueryData<EventResponse>(
      workspaceEventsQueryKey(workspaceId),
    );
    const derived = deriveWorkspaceStateFromCaches({
      workspaceId,
      stateData,
      eventLog: eventData,
    });

    return stateData ? derived.state : currentItems;
  }, [workspaceId, queryClient, currentItems]);

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
        ? { ...item, ...pendingChanges }
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

      mutation.mutate(
        createEvent(
          "ITEM_UPDATED",
          { id: itemId, changes: finalChanges, name: newName },
          userId,
          userName,
        ),
      );

      pendingItemChangesRef.current.delete(itemId);
      updateItemDebouncerRef.current.delete(itemId);
    },
    [getLatestItemsFromState, mutation, userId, userName],
  );

  const commitPendingItemDataUpdate = useCallback(
    (itemId: string) => {
      const finalUpdater = pendingItemDataUpdatersRef.current.get(itemId);
      if (!finalUpdater) {
        updateItemDataDebouncerRef.current.delete(itemId);
        return;
      }

      // Read latest state from cache instead of relying on closure state so
      // newly-created items remain addressable while optimistic events settle.
      let latestItem: Item | undefined;
      if (workspaceId) {
        const cacheData = queryClient.getQueryData<EventResponse>(
          workspaceEventsQueryKey(workspaceId),
        );
        if (cacheData?.events) {
          const latestState = deriveWorkspaceStateFromCaches({
            workspaceId,
            stateData: getCachedWorkspaceState(queryClient, workspaceId),
            eventLog: cacheData,
          }).state;
          latestItem = latestState.find((item) => item.id === itemId);
        }
      }
      if (!latestItem) {
        latestItem = currentItems.find((item) => item.id === itemId);
      }
      if (!latestItem) {
        const cacheData = workspaceId
          ? queryClient.getQueryData<EventResponse>(
              workspaceEventsQueryKey(workspaceId),
            )
          : null;
        const itemCount = cacheData?.events
          ? deriveWorkspaceStateFromCaches({
              workspaceId,
              stateData: getCachedWorkspaceState(queryClient, workspaceId),
              eventLog: cacheData,
            }).state.length
          : 0;
        logger.warn(
          `[OCR/UPDATE] updateItemData: Item ${itemId} not found. Item may have been deleted. Cache has ${itemCount} items.`,
          {
            itemId,
            workspaceId,
          },
        );
        pendingItemDataUpdatersRef.current.delete(itemId);
        updateItemDataDebouncerRef.current.delete(itemId);
        return;
      }

      const newData = finalUpdater(latestItem.data);

      mutation.mutate(
        createEvent(
          "ITEM_UPDATED",
          {
            id: itemId,
            changes: { data: newData },
            name: latestItem.name,
          },
          userId,
          userName,
        ),
      );

      pendingItemDataUpdatersRef.current.delete(itemId);
      updateItemDataDebouncerRef.current.delete(itemId);
    },
    [workspaceId, queryClient, currentItems, mutation, userId, userName],
  );

  const getOrCreateUpdateItemDebouncer = useCallback(
    (itemId: string) => {
      const existing = updateItemDebouncerRef.current.get(itemId);
      if (existing) {
        return existing;
      }

      const debouncer = new Debouncer(() => commitPendingItemUpdate(itemId), {
        wait: ITEM_UPDATE_DEBOUNCE_MS,
      });
      updateItemDebouncerRef.current.set(itemId, debouncer);
      return debouncer;
    },
    [commitPendingItemUpdate],
  );

  const getOrCreateUpdateItemDataDebouncer = useCallback(
    (itemId: string) => {
      const existing = updateItemDataDebouncerRef.current.get(itemId);
      if (existing) {
        return existing;
      }

      const debouncer = new Debouncer(
        () => commitPendingItemDataUpdate(itemId),
        { wait: ITEM_UPDATE_DEBOUNCE_MS },
      );
      updateItemDataDebouncerRef.current.set(itemId, debouncer);
      return debouncer;
    },
    [commitPendingItemDataUpdate],
  );

  // Cleanup timeouts on unmount
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
    (
      type: CardType,
      name?: string,
      initialData?: Partial<Item["data"]>,
      initialLayout?: { w: number; h: number },
    ) => {
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

      const id = generateItemId();

      // Merge default data with initial data
      const baseData = defaultDataFor(validType);
      const mergedData = initialData
        ? { ...baseData, ...initialData }
        : baseData;

      const activeFolderId = useUIStore.getState().activeFolderId;

      const folderId = activeFolderId ?? null;
      const finalName =
        name || getNextUniqueDefaultName(currentItems, validType, folderId);

      const item: Item = {
        id,
        type: validType,
        name: finalName,
        subtitle: "",
        data: mergedData as ItemData,
        color: getRandomCardColor(), // Assign random color to new cards
        folderId: activeFolderId ?? undefined, // Auto-assign to active folder
      };

      const event = createEvent("ITEM_CREATED", { id, item }, userId, userName);

      mutation.mutate(event);

      return id; // Return ID for further operations
    },
    [mutation, userId, userName, workspaceId, currentItems],
  );

  const createItems = useCallback(
    (
      items: Array<{
        type: CardType;
        name?: string;
        initialData?: Partial<Item["data"]>;
        initialLayout?: { w: number; h: number };
      }>,
      options?: { showSuccessToast?: boolean },
    ): string[] => {
      if (items.length === 0) {
        return [];
      }

      const activeFolderId = useUIStore.getState().activeFolderId;

      // Track items we're creating to detect within-batch duplicates
      const itemsSoFar: Item[] = [];

      // Create all items
      const createdItems: Item[] = items
        .map(({ type, name, initialData, initialLayout }) => {
          // Validate type is a valid CardType
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

          const id = generateItemId();
          const folderId = activeFolderId ?? null;
          const allItemsSoFar = [...currentItems, ...itemsSoFar];
          const finalName =
            name ||
            getNextUniqueDefaultName(allItemsSoFar, validType, folderId);

          // Check duplicate against existing + already-created in this batch (only when explicit name given)
          if (
            name &&
            hasDuplicateName(allItemsSoFar, finalName, validType, folderId)
          ) {
            return null;
          }

          // Merge default data with initial data
          const baseData = defaultDataFor(validType);
          const mergedData = initialData
            ? { ...baseData, ...initialData }
            : baseData;

          const newItem: Item = {
            id,
            type: validType,
            name: finalName,
            subtitle: "",
            data: mergedData as ItemData,
            color: getRandomCardColor(), // Assign random color to new cards
            folderId: activeFolderId ?? undefined, // Auto-assign to active folder
          };
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

      // Create single batch event with all items
      const event = createEvent(
        "BULK_ITEMS_CREATED",
        { items: createdItems },
        userId,
        userName,
      );

      mutation.mutate(event);

      // Show success toast with count
      if (options?.showSuccessToast !== false) {
        const itemCount = createdItems.length;
        toast.success(`${itemCount} card${itemCount === 1 ? "" : "s"} created`);
      }

      // Return array of created item IDs
      return createdItems.map((item) => item.id);
    },
    [mutation, userId, userName, workspaceId, currentItems],
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

  const deleteItem = useCallback(
    async (id: string) => {
      // If this is a PDF card, delete the file from Supabase storage first
      const itemToDelete = currentItems.find((item) => item.id === id);
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
            // Continue with card deletion even if file deletion fails
          }
        }
      }

      // Delete the card (include name for UX copy and diagnostics)
      const event = createEvent(
        "ITEM_DELETED",
        { id, name: itemToDelete?.name },
        userId,
        userName,
      );
      mutation.mutate(event);
    },
    [mutation, userId, userName, currentItems],
  );

  // Helper for updating item data (used by field actions)
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

  // Update all items at once (used for layout changes, reordering, and bulk delete)
  const updateAllItems = useCallback(
    (items: Item[]) => {
      // Read the latest state from cache (including optimistic updates)
      // instead of using the potentially stale currentState prop (including optimistic updates)
      // instead of using the potentially stale currentState prop
      // This ensures we compare against the most recent state even when a previous mutation is pending
      let latestState: Item[];
      if (workspaceId) {
        const cacheData = queryClient.getQueryData<EventResponse>(
          workspaceEventsQueryKey(workspaceId),
        );
        if (cacheData?.events) {
          latestState = deriveWorkspaceStateFromCaches({
            workspaceId,
            stateData: getCachedWorkspaceState(queryClient, workspaceId),
            eventLog: cacheData,
          }).state;
        } else {
          // Fallback to prop if cache is empty (shouldn't happen in normal flow)
          latestState = currentItems;
        }
      } else {
        latestState = currentItems;
      }

      const previousItemCount = latestState.length;
      const currentIds = new Set(latestState.map((i) => i.id));
      const newIds = new Set(items.map((i) => i.id));

      // Send only what changed – no full item data (avoids huge payloads for textbooks)

      // Count decreased: bulk delete – send only deletedIds
      if (items.length < previousItemCount) {
        const deletedIds = latestState
          .filter((i) => !newIds.has(i.id))
          .map((i) => i.id);
        mutation.mutate(
          createEvent(
            "BULK_ITEMS_UPDATED",
            { deletedIds, previousItemCount },
            userId,
            userName,
          ),
        );
        return;
      }

      // Count increased: items added – send only the new items (typically 1–2)
      if (items.length > previousItemCount) {
        const addedItems = items.filter((i) => !currentIds.has(i.id));
        mutation.mutate(
          createEvent(
            "BULK_ITEMS_UPDATED",
            { addedItems, previousItemCount },
            userId,
            userName,
          ),
        );
        return;
      }

      const orderChanged = items.some(
        (item, index) => item.id !== latestState[index]?.id,
      );

      if (orderChanged) {
        mutation.mutate(
          createEvent(
            "BULK_ITEMS_UPDATED",
            {
              orderedIds: items.map((item) => item.id),
              previousItemCount,
            },
            userId,
            userName,
          ),
        );
      }
    },
    [workspaceId, queryClient, currentItems, mutation, userId, userName],
  );

  // =====================================================
  // FOLDER OPERATIONS
  // Folders are now items with type: 'folder'
  // =====================================================

  const createFolder = useCallback(
    (name: string, color?: CardColor): string => {
      // Create a folder as an item with type: 'folder'
      const folderId = createItem("folder", name);
      // Update color if provided (createItem uses random color)
      if (color) {
        updateItem(folderId, { color });
      }
      return folderId;
    },
    [createItem, updateItem],
  );

  const createFolderWithItems = useCallback(
    (name: string, itemIds: string[], color?: CardColor): string => {
      // Get active folder - auto-assign new folder to the currently viewed folder
      const activeFolderId = useUIStore.getState().activeFolderId;

      // Prevent cycles: exclude active folder and its ancestors from selection
      const safeItemIds = filterItemIdsForFolderCreation(
        itemIds,
        activeFolderId,
        getLatestItemsFromState() ?? [],
      );

      if (safeItemIds.length === 0) {
        toast.error(
          "Cannot create folder: selected items would create a circular reference.",
        );
        return ""; // Return empty string since no folder was created
      }

      const folderId = generateItemId();

      const baseData = defaultDataFor("folder");

      const folder: Item = {
        id: folderId,
        type: "folder",
        name: name || "New Folder",
        subtitle: "",
        data: baseData as ItemData,
        color: color || getRandomCardColor(),
        folderId: activeFolderId ?? undefined, // Auto-assign to active folder (can be nested)
      };

      // Create single atomic event that creates folder and moves items
      const event = createEvent(
        "FOLDER_CREATED_WITH_ITEMS",
        { folder, itemIds: safeItemIds },
        userId,
        userName,
      );

      mutation.mutate(event);

      // Show success toast
      toast.success(
        `Folder created with ${safeItemIds.length} item${safeItemIds.length === 1 ? "" : "s"}`,
      );

      return folderId;
    },
    [mutation, userId, userName, getLatestItemsFromState],
  );

  // updateFolder now just calls updateItem (folders are items)
  const updateFolder = useCallback(
    (folderId: string, changes: Partial<Item>) => {
      updateItem(folderId, changes);
    },
    [updateItem],
  );

  // deleteFolder now just calls deleteItem (folders are items)
  const deleteFolder = useCallback(
    (folderId: string) => {
      const folder = currentItems?.find(
        (i) => i.id === folderId && i.type === "folder",
      );
      deleteItem(folderId);
      toast.success(
        folder ? `Folder "${folder.name}" deleted` : "Folder deleted",
      );
    },
    [deleteItem, currentItems],
  );

  // deleteFolderWithContents deletes the folder and all items inside it (including nested)
  // Uses atomic bulk update pattern (same as handleBulkDelete in WorkspaceSection)
  const deleteFolderWithContents = useCallback(
    (folderId: string) => {
      // CRITICAL: Read latest state from cache to avoid stale data issues
      // (same pattern as updateAllItems - currentState prop can be stale)
      let latestItems: Item[];
      if (workspaceId) {
        const cacheData = queryClient.getQueryData<EventResponse>(
          workspaceEventsQueryKey(workspaceId),
        );
        if (cacheData?.events) {
          const latestState = deriveWorkspaceStateFromCaches({
            workspaceId,
            stateData: getCachedWorkspaceState(queryClient, workspaceId),
            eventLog: cacheData,
          }).state;
          latestItems = latestState;
        } else {
          latestItems = currentItems;
        }
      } else {
        latestItems = currentItems;
      }

      const folder = latestItems.find(
        (i) => i.id === folderId && i.type === "folder",
      );
      // Find all descendant items recursively (handles nested folders)
      const allDescendantIds = getAllDescendantIds(folderId, latestItems);

      // Create set of all IDs to delete (descendants + folder itself)
      const idsToDelete = new Set([...allDescendantIds, folderId]);
      const itemCount = allDescendantIds.length;

      // Delete PDF files from storage (fire-and-forget, non-blocking)
      // This is best-effort cleanup - files may become orphaned if this fails
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

      // Atomic bulk delete using updateAllItems pattern (single BULK_ITEMS_UPDATED event)
      const remainingItems = latestItems.filter(
        (item) => !idsToDelete.has(item.id),
      );
      updateAllItems(remainingItems);

      toast.success(
        folder
          ? `Folder "${folder.name}" and ${itemCount} ${itemCount === 1 ? "item" : "items"} deleted`
          : `Folder and ${itemCount} ${itemCount === 1 ? "item" : "items"} deleted`,
      );
    },
    [workspaceId, queryClient, currentItems, updateAllItems],
  );

  const moveItemToFolder = useCallback(
    (itemId: string, folderId: string | null) => {
      const item = currentItems.find((i) => i.id === itemId);
      const event = createEvent(
        "ITEM_MOVED_TO_FOLDER",
        { itemId, folderId, itemName: item?.name },
        userId,
        userName,
      );
      mutation.mutate(event);
    },
    [mutation, userId, userName, currentItems],
  );

  const moveItemsToFolder = useCallback(
    (itemIds: string[], folderId: string | null) => {
      const itemNames = itemIds
        .map((id) => currentItems.find((i) => i.id === id)?.name)
        .filter((n): n is string => n != null);
      const event = createEvent(
        "ITEMS_MOVED_TO_FOLDER",
        { itemIds, folderId, itemNames },
        userId,
        userName,
      );
      mutation.mutate(event);
    },
    [mutation, userId, userName, currentItems],
  );

  // Flush pending debounced changes for an item (called when modal closes)
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
    // Folder operations
    createFolder,
    createFolderWithItems,
    updateFolder,
    deleteFolder,
    deleteFolderWithContents,
    moveItemToFolder,
    moveItemsToFolder,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
