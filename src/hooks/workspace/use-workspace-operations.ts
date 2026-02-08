import { useCallback, useRef, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "./use-workspace-mutation";
import { createEvent, type EventResponse } from "@/lib/workspace/events";
import { replayEvents } from "@/lib/workspace/event-reducer";
import type { Item, ItemData, CardType, AgentState } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import { generateItemId } from "@/lib/workspace-state/item-helpers";
import { defaultDataFor } from "@/lib/workspace-state/item-helpers";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { logger } from "@/lib/utils/logger";
import { useUIStore } from "@/lib/stores/ui-store";
import { getLayoutForBreakpoint, findNextAvailablePosition } from "@/lib/workspace-state/grid-layout-helpers";
import { useRealtimeContextOptional } from "@/contexts/RealtimeContext";

/**
 * Return type for workspace operations
 */
export interface WorkspaceOperations {
  createItem: (type: CardType, name?: string, initialData?: Partial<Item['data']>) => string;
  createItems: (items: Array<{ type: CardType; name?: string; initialData?: Partial<Item['data']>; initialLayout?: { w: number; h: number } }>) => string[];
  updateItem: (id: string, changes: Partial<Item>, source?: 'user' | 'agent') => void;
  updateItemData: (itemId: string, updater: (prev: Item['data']) => Item['data'], source?: 'user' | 'agent') => void;
  deleteItem: (id: string) => void;
  updateAllItems: (items: Item[]) => void;
  setGlobalTitle: (title: string) => void;
  setGlobalDescription: (description: string) => void;

  flushPendingChanges: (itemId: string) => void;
  // Folder operations
  createFolder: (name: string, color?: CardColor) => string;
  createFolderWithItems: (name: string, itemIds: string[], color?: CardColor) => string;
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
  currentState: AgentState
): WorkspaceOperations {
  const { data: session } = useSession();
  const user = session?.user;
  const queryClient = useQueryClient();

  // Get broadcast function from realtime context (if available)
  const realtimeContext = useRealtimeContextOptional();
  const broadcastEvent = realtimeContext?.broadcastEvent;

  // Pass broadcast callback to mutation hook for realtime sync
  const mutation = useWorkspaceMutation(workspaceId, {
    onEventSaved: broadcastEvent,
  });

  const userId = user?.id || "anonymous";
  const userName = user?.name || user?.email || undefined;

  // Debounce refs for updateItem and updateItemData
  // Maps item ID to timeout ID
  const updateItemDebounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const updateItemDataDebounceRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  // Store pending changes to merge them
  const pendingItemChangesRef = useRef<Map<string, Partial<Item>>>(new Map());
  const pendingItemDataUpdatersRef = useRef<Map<string, (prev: Item['data']) => Item['data']>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      updateItemDebounceRef.current.forEach((timeout) => clearTimeout(timeout));
      updateItemDataDebounceRef.current.forEach((timeout) => clearTimeout(timeout));
      updateItemDebounceRef.current.clear();
      updateItemDataDebounceRef.current.clear();
      pendingItemChangesRef.current.clear();
      pendingItemDataUpdatersRef.current.clear();
    };
  }, []);

  const createItem = useCallback(
    (type: CardType, name?: string, initialData?: Partial<Item['data']>) => {
      // Validate type is a valid CardType
      logger.debug("🔧 [CREATE-ITEM] Received type:", type, "typeof:", typeof type, "value:", JSON.stringify(type));

      const validTypes: CardType[] = ["note", "pdf", "flashcard", "folder", "youtube", "image"];
      const validType = validTypes.includes(type) ? type : "note";

      if (validType !== type) {
        logger.warn(`🔧 [CREATE-ITEM] Invalid type "${type}" (typeof ${typeof type}), using "note" instead`);
      }

      logger.debug("🔧 [CREATE-ITEM] Creating item:", { type: validType, name, userId, workspaceId, hasInitialData: !!initialData });
      const id = generateItemId();

      // Merge default data with initial data
      const baseData = defaultDataFor(validType);
      const mergedData = initialData ? { ...baseData, ...initialData } : baseData;


      // Get active folder - auto-assign new items to the currently viewed folder
      const activeFolderId = useUIStore.getState().activeFolderId;
      logger.debug("🔧 [CREATE-ITEM] Active folder:", { activeFolderId });

      logger.debug("🔧 [CREATE-ITEM] Base data:", baseData);
      logger.debug("🔧 [CREATE-ITEM] Initial data:", initialData);
      logger.debug("🔧 [CREATE-ITEM] Merged data:", mergedData);

      const item: Item = {
        id,
        type: validType,
        name: name || `New ${validType.charAt(0).toUpperCase() + validType.slice(1)}`,
        subtitle: "",
        data: mergedData as ItemData,
        color: getRandomCardColor(), // Assign random color to new cards
        folderId: activeFolderId ?? undefined, // Auto-assign to active folder
      };

      const event = createEvent("ITEM_CREATED", { id, item }, userId, userName);

      mutation.mutate(event);

      return id; // Return ID for further operations
    },
    [mutation, userId, userName, workspaceId]
  );

  const createItems = useCallback(
    (items: Array<{ type: CardType; name?: string; initialData?: Partial<Item['data']>; initialLayout?: { w: number; h: number } }>): string[] => {
      if (items.length === 0) {
        return [];
      }

      logger.debug("🔧 [CREATE-ITEMS] Creating items:", { count: items.length, userId, workspaceId });



      // Get active folder - auto-assign new items to the currently viewed folder
      const activeFolderId = useUIStore.getState().activeFolderId;

      // Get items in current view for layout calculation
      // We need to maintain a running list including newly created items to prevent stacking
      const currentItems = currentState.items.filter(item =>
        activeFolderId ? item.folderId === activeFolderId : !item.folderId
      );

      // Mutable array to track items for position calculation as we generate them
      const itemsForLayout = [...currentItems];

      // Create all items
      const createdItems: Item[] = items.map(({ type, name, initialData, initialLayout }) => {
        // Validate type is a valid CardType
        const validTypes: CardType[] = ["note", "pdf", "flashcard", "folder", "youtube", "image"];
        const validType = validTypes.includes(type) ? type : "note";

        if (validType !== type) {
          logger.warn(`🔧 [CREATE-ITEMS] Invalid type "${type}", using "note" instead`);
        }

        const id = generateItemId();

        // Merge default data with initial data
        const baseData = defaultDataFor(validType);
        const mergedData = initialData ? { ...baseData, ...initialData } : baseData;

        // Calculate layout if initial dimensions provided
        let layout = undefined;
        if (initialLayout) {
          const position = findNextAvailablePosition(
            itemsForLayout,
            validType,
            4, // Default cols
            name,
            "",
            initialLayout.w,
            initialLayout.h
          );

          layout = { lg: position };

          // Add placeholder item to layout tracking array so next item doesn't overlap
          // We only need the layout properties for findNextAvailablePosition
          itemsForLayout.push({
            id,
            type: validType,
            name: name || "",
            subtitle: "",
            data: baseData as any,
            layout: { lg: position }
          });
        }

        return {
          id,
          type: validType,
          name: name || `New ${validType.charAt(0).toUpperCase() + validType.slice(1)}`,
          subtitle: "",
          data: mergedData as ItemData,
          color: getRandomCardColor(), // Assign random color to new cards
          folderId: activeFolderId ?? undefined, // Auto-assign to active folder
          layout,
        };
      });

      // Create single batch event with all items
      const event = createEvent("BULK_ITEMS_CREATED", { items: createdItems }, userId, userName);

      mutation.mutate(event);

      // Show success toast with count
      const itemCount = createdItems.length;
      toast.success(`${itemCount} card${itemCount === 1 ? '' : 's'} created`);

      // Return array of created item IDs
      return createdItems.map(item => item.id);
    },
    [mutation, userId, userName, workspaceId]
  );

  const updateItem = useCallback(
    (id: string, changes: Partial<Item>, source: 'user' | 'agent' = 'user') => {
      // Merge with any pending changes for this item
      const existingPending = pendingItemChangesRef.current.get(id) || {};
      const mergedChanges = { ...existingPending, ...changes };
      pendingItemChangesRef.current.set(id, mergedChanges);

      // Clear existing debounce for this item
      const existingTimeout = updateItemDebounceRef.current.get(id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new debounce (500ms delay)
      const timeout = setTimeout(() => {
        const finalChanges = pendingItemChangesRef.current.get(id);
        if (finalChanges) {
          logger.debug("⏱️ [DEBOUNCE] updateItem firing after 500ms:", { id, changes: finalChanges, source });
          const event = createEvent("ITEM_UPDATED", { id, changes: finalChanges, source }, userId, userName);
          mutation.mutate(event);
          // Clean up
          pendingItemChangesRef.current.delete(id);
          updateItemDebounceRef.current.delete(id);
        }
      }, 500);

      updateItemDebounceRef.current.set(id, timeout);
    },
    [mutation, userId, userName]
  );

  const deleteItem = useCallback(
    async (id: string) => {
      logger.debug("🗑️ [DELETE-ITEM] Deleting item:", { id, userId, userName });

      // If this is a PDF card, delete the file from Supabase storage first
      const itemToDelete = currentState.items.find(item => item.id === id);
      if (itemToDelete && itemToDelete.type === 'pdf') {
        const pdfData = itemToDelete.data as { fileUrl?: string; filename?: string };
        if (pdfData?.fileUrl) {
          try {
            logger.debug("🗑️ [DELETE-ITEM] Deleting PDF file from Supabase:", { fileUrl: pdfData.fileUrl });
            const deleteResponse = await fetch(`/api/delete-file?url=${encodeURIComponent(pdfData.fileUrl)}`, {
              method: 'DELETE',
            });

            if (!deleteResponse.ok) {
              const errorData = await deleteResponse.json().catch(() => ({ error: 'Failed to delete file' }));
              logger.warn("🗑️ [DELETE-ITEM] Failed to delete PDF file from Supabase:", errorData.error);
              // Continue with card deletion even if file deletion fails (file might not exist)
            } else {
              logger.debug("🗑️ [DELETE-ITEM] Successfully deleted PDF file from Supabase");
            }
          } catch (error) {
            logger.error("🗑️ [DELETE-ITEM] Error deleting PDF file:", error);
            // Continue with card deletion even if file deletion fails
          }
        }
      }

      // Delete the card (create event)
      const event = createEvent("ITEM_DELETED", { id }, userId, userName);
      logger.debug("🗑️ [DELETE-ITEM] Created event:", event);
      mutation.mutate(event);
    },
    [mutation, userId, userName, currentState.items]
  );

  const setGlobalTitle = useCallback(
    (title: string) => {
      const event = createEvent("GLOBAL_TITLE_SET", { title }, userId, userName);
      mutation.mutate(event);
    },
    [mutation, userId, userName]
  );

  const setGlobalDescription = useCallback(
    (description: string) => {
      const event = createEvent("GLOBAL_DESCRIPTION_SET", { description }, userId, userName);
      mutation.mutate(event);
    },
    [mutation, userId, userName]
  );


  // Helper for updating item data (used by field actions)
  const updateItemData = useCallback(
    (itemId: string, updater: (prev: Item['data']) => Item['data'], source: 'user' | 'agent' = 'user') => {
      // Chain updaters if there's already a pending one
      const existingUpdater = pendingItemDataUpdatersRef.current.get(itemId);
      if (existingUpdater) {
        // Chain the updaters: apply existing, then new
        pendingItemDataUpdatersRef.current.set(itemId, (prev: Item['data']) => updater(existingUpdater(prev)));
      } else {
        pendingItemDataUpdatersRef.current.set(itemId, updater);
      }

      // Clear existing debounce for this item
      const existingTimeout = updateItemDataDebounceRef.current.get(itemId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new debounce (500ms delay)
      const timeout = setTimeout(() => {
        const finalUpdater = pendingItemDataUpdatersRef.current.get(itemId);
        if (finalUpdater) {
          // Get the latest item state when the timeout fires
          const latestItem = currentState.items.find(item => item.id === itemId);
          if (!latestItem) {
            logger.warn(`updateItemData: Item ${itemId} not found when applying debounced update`);
            pendingItemDataUpdatersRef.current.delete(itemId);
            updateItemDataDebounceRef.current.delete(itemId);
            return;
          }

          // Apply the final updater to get new data
          const newData = finalUpdater(latestItem.data);

          logger.debug("⏱️ [DEBOUNCE] updateItemData firing after 500ms:", {
            itemId,
            hasDataChanges: true,
            dataKeys: Object.keys(newData)
          });

          // Emit update event with new data
          const event = createEvent("ITEM_UPDATED", {
            id: itemId,
            changes: { data: newData },
            source
          }, userId, userName);
          mutation.mutate(event);
          // Clean up
          pendingItemDataUpdatersRef.current.delete(itemId);
          updateItemDataDebounceRef.current.delete(itemId);
        }
      }, 500);

      updateItemDataDebounceRef.current.set(itemId, timeout);
    },
    [currentState, mutation, userId, userName]
  );



  // Update all items at once (used for layout changes, reordering, and bulk delete)
  const updateAllItems = useCallback(
    (items: Item[]) => {
      const bulkUpdateStart = performance.now();
      logger.debug("🔧 [BULK-UPDATE] Updating all items:", { count: items.length });

      // CRITICAL FIX: Read the latest state from cache (including optimistic updates)
      // instead of using the potentially stale currentState prop
      // This ensures we compare against the most recent state even when a previous mutation is pending
      let latestState: AgentState;
      if (workspaceId) {
        const cacheData = queryClient.getQueryData<EventResponse>([
          "workspace",
          workspaceId,
          "events",
        ]);
        if (cacheData?.events) {
          // Replay events to get current state including optimistic updates
          latestState = replayEvents(cacheData.events, workspaceId, cacheData.snapshot?.state);
        } else {
          // Fallback to prop if cache is empty (shouldn't happen in normal flow)
          latestState = currentState;
        }
      } else {
        latestState = currentState;
      }

      const previousItemCount = latestState.items.length;

      // Check if items were added or removed (e.g. bulk delete)
      if (items.length !== previousItemCount) {
        logger.debug("🔧 [BULK-UPDATE] Item count changed, using full update", { prev: previousItemCount, next: items.length });
        const event = createEvent("BULK_ITEMS_UPDATED", {
          layoutUpdates: [], // Not used when items is present
          previousItemCount,
          items // Send full items list for add/remove operations
        }, userId, userName);
        mutation.mutate(event);
        return;
      }

      // Extract only layout changes to minimize payload size
      // Compare with latest state (from cache) to find items whose layout changed
      const layoutUpdates: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
      const currentItemsMap = new Map(latestState.items.map(item => [item.id, item]));

      for (const item of items) {
        const currentItem = currentItemsMap.get(item.id);
        const currentLayout = currentItem ? getLayoutForBreakpoint(currentItem, 'lg') : undefined;
        const newLayout = getLayoutForBreakpoint(item, 'lg');

        // Only include if layout exists and has changed
        if (newLayout && (!currentLayout ||
          currentLayout.x !== newLayout.x ||
          currentLayout.y !== newLayout.y ||
          currentLayout.w !== newLayout.w ||
          currentLayout.h !== newLayout.h)) {
          layoutUpdates.push({
            id: item.id,
            x: newLayout.x,
            y: newLayout.y,
            w: newLayout.w,
            h: newLayout.h,
          });
        }
      }
      // Only create event if there are actual layout changes
      if (layoutUpdates.length > 0) {
        const event = createEvent("BULK_ITEMS_UPDATED", {
          layoutUpdates,
          previousItemCount
        }, userId, userName);
        mutation.mutate(event);
      } else {
        logger.debug("🔧 [BULK-UPDATE] No layout changes detected, skipping event");
      }
    },
    [workspaceId, queryClient, currentState, mutation, userId, userName]
  );




  // =====================================================
  // FOLDER OPERATIONS
  // Folders are now items with type: 'folder'
  // =====================================================

  const createFolder = useCallback(
    (name: string, color?: CardColor): string => {
      // Create a folder as an item with type: 'folder'
      const folderId = createItem('folder', name);
      // Update color if provided (createItem uses random color)
      if (color) {
        updateItem(folderId, { color });
      }
      logger.debug("📁 [FOLDER-CREATE] Created folder item:", { folderId, name });
      return folderId;
    },
    [createItem, updateItem]
  );

  const createFolderWithItems = useCallback(
    (name: string, itemIds: string[], color?: CardColor): string => {
      // Generate folder ID
      const folderId = generateItemId();

      // Get active folder - auto-assign new folder to the currently viewed folder
      const activeFolderId = useUIStore.getState().activeFolderId;
      logger.debug("📁 [FOLDER-CREATE-WITH-ITEMS] Active folder:", { activeFolderId });

      const baseData = defaultDataFor('folder');

      const folder: Item = {
        id: folderId,
        type: 'folder',
        name: name || 'New Folder',
        subtitle: '',
        data: baseData as ItemData,
        color: color || getRandomCardColor(),
        folderId: activeFolderId ?? undefined, // Auto-assign to active folder (can be nested)
      };

      // Create single atomic event that creates folder and moves items
      const event = createEvent("FOLDER_CREATED_WITH_ITEMS", { folder, itemIds }, userId, userName);

      mutation.mutate(event);

      logger.debug("📁 [FOLDER-CREATE-WITH-ITEMS] Created folder with items:", { folderId, name, itemCount: itemIds.length });

      // Show success toast
      toast.success(`Folder created with ${itemIds.length} item${itemIds.length === 1 ? '' : 's'}`);

      return folderId;
    },
    [mutation, userId, userName]
  );

  // updateFolder now just calls updateItem (folders are items)
  const updateFolder = useCallback(
    (folderId: string, changes: Partial<Item>) => {
      logger.debug("📁 [FOLDER-UPDATE] Updating folder item:", { folderId, changes });
      updateItem(folderId, changes);
    },
    [updateItem]
  );

  // deleteFolder now just calls deleteItem (folders are items)
  const deleteFolder = useCallback(
    (folderId: string) => {
      const folder = currentState.items?.find(i => i.id === folderId && i.type === 'folder');
      logger.debug("📁 [FOLDER-DELETE] Deleting folder item:", { folderId, folderName: folder?.name });
      deleteItem(folderId);
      toast.success(folder ? `Folder "${folder.name}" deleted` : "Folder deleted");
    },
    [deleteItem, currentState.items]
  );

  // Helper to recursively find all descendant IDs (items in folder and nested subfolders)
  const getAllDescendantIds = useCallback(
    (folderId: string, items: Item[]): string[] => {
      const directChildren = items.filter(item => item.folderId === folderId);
      const descendantIds: string[] = [];

      for (const child of directChildren) {
        descendantIds.push(child.id);
        // Recursively get descendants of nested folders
        if (child.type === 'folder') {
          descendantIds.push(...getAllDescendantIds(child.id, items));
        }
      }

      return descendantIds;
    },
    []
  );

  // deleteFolderWithContents deletes the folder and all items inside it (including nested)
  // Uses atomic bulk update pattern (same as handleBulkDelete in WorkspaceSection)
  const deleteFolderWithContents = useCallback(
    (folderId: string) => {
      // CRITICAL: Read latest state from cache to avoid stale data issues
      // (same pattern as updateAllItems - currentState prop can be stale)
      let latestItems: Item[];
      if (workspaceId) {
        const cacheData = queryClient.getQueryData<EventResponse>([
          "workspace",
          workspaceId,
          "events",
        ]);
        if (cacheData?.events) {
          const latestState = replayEvents(cacheData.events, workspaceId, cacheData.snapshot?.state);
          latestItems = latestState.items;
        } else {
          latestItems = currentState.items;
        }
      } else {
        latestItems = currentState.items;
      }

      const folder = latestItems.find(i => i.id === folderId && i.type === 'folder');
      logger.debug("📁 [FOLDER-DELETE-WITH-CONTENTS] Deleting folder and contents:", { folderId, folderName: folder?.name });

      // Find all descendant items recursively (handles nested folders)
      const allDescendantIds = getAllDescendantIds(folderId, latestItems);

      // Create set of all IDs to delete (descendants + folder itself)
      const idsToDelete = new Set([...allDescendantIds, folderId]);
      const itemCount = allDescendantIds.length;

      logger.debug("📁 [FOLDER-DELETE-WITH-CONTENTS] Found items to delete:", { itemCount, itemIds: [...idsToDelete] });

      // Delete PDF files from storage (fire-and-forget, non-blocking)
      // This is best-effort cleanup - files may become orphaned if this fails
      const itemsToDelete = latestItems.filter(item => idsToDelete.has(item.id));
      for (const item of itemsToDelete) {
        if (item.type === 'pdf') {
          const pdfData = item.data as { fileUrl?: string };
          if (pdfData?.fileUrl) {
            fetch(`/api/delete-file?url=${encodeURIComponent(pdfData.fileUrl)}`, {
              method: 'DELETE',
            }).catch(err => logger.warn("📁 [FOLDER-DELETE-WITH-CONTENTS] Failed to delete PDF file:", err));
          }
        }
      }

      // Atomic bulk delete using updateAllItems pattern (single BULK_ITEMS_UPDATED event)
      const remainingItems = latestItems.filter(item => !idsToDelete.has(item.id));
      updateAllItems(remainingItems);

      toast.success(
        folder
          ? `Folder "${folder.name}" and ${itemCount} ${itemCount === 1 ? 'item' : 'items'} deleted`
          : `Folder and ${itemCount} ${itemCount === 1 ? 'item' : 'items'} deleted`
      );
    },
    [workspaceId, queryClient, currentState.items, getAllDescendantIds, updateAllItems]
  );

  const moveItemToFolder = useCallback(
    (itemId: string, folderId: string | null) => {
      logger.debug("📁 [ITEM-MOVE] Moving item to folder:", { itemId, folderId });
      const event = createEvent("ITEM_MOVED_TO_FOLDER", { itemId, folderId }, userId, userName);
      mutation.mutate(event);
    },
    [mutation, userId, userName]
  );

  const moveItemsToFolder = useCallback(
    (itemIds: string[], folderId: string | null) => {
      logger.debug("📁 [ITEMS-MOVE] Moving items to folder:", { itemIds, folderId });
      const event = createEvent("ITEMS_MOVED_TO_FOLDER", { itemIds, folderId }, userId, userName);
      mutation.mutate(event);
    },
    [mutation, userId, userName]
  );

  // Flush pending debounced changes for an item (called when modal closes)
  const flushPendingChanges = useCallback(
    (itemId: string) => {
      logger.debug("💾 [FLUSH] Flushing pending changes for item:", { itemId });

      // Flush updateItem pending changes
      const pendingItemTimeout = updateItemDebounceRef.current.get(itemId);
      if (pendingItemTimeout) {
        clearTimeout(pendingItemTimeout);
        updateItemDebounceRef.current.delete(itemId);

        const pendingChanges = pendingItemChangesRef.current.get(itemId);
        if (pendingChanges) {
          logger.debug("💾 [FLUSH] Sending pending updateItem changes:", { itemId, changes: pendingChanges });
          const event = createEvent("ITEM_UPDATED", { id: itemId, changes: pendingChanges }, userId, userName);
          mutation.mutate(event);
          pendingItemChangesRef.current.delete(itemId);
        }
      }

      // Flush updateItemData pending changes
      const pendingDataTimeout = updateItemDataDebounceRef.current.get(itemId);
      if (pendingDataTimeout) {
        clearTimeout(pendingDataTimeout);
        updateItemDataDebounceRef.current.delete(itemId);

        const pendingUpdater = pendingItemDataUpdatersRef.current.get(itemId);
        if (pendingUpdater) {
          // Get the latest item state
          const latestItem = currentState.items.find(item => item.id === itemId);
          if (latestItem) {
            logger.debug("💾 [FLUSH] Sending pending updateItemData changes:", { itemId });
            const newData = pendingUpdater(latestItem.data);
            const event = createEvent("ITEM_UPDATED", {
              id: itemId,
              changes: { data: newData }
            }, userId, userName);
            mutation.mutate(event);
            pendingItemDataUpdatersRef.current.delete(itemId);
          } else {
            logger.warn(`💾 [FLUSH] Item ${itemId} not found when flushing pending data changes`);
            pendingItemDataUpdatersRef.current.delete(itemId);
          }
        }
      }
    },
    [currentState, mutation, userId, userName]
  );

  return {
    createItem,
    createItems,
    updateItem,
    updateItemData,
    deleteItem,
    updateAllItems,
    setGlobalTitle,
    setGlobalDescription,
    flushPendingChanges,
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

