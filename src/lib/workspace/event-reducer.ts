import type { WorkspaceState } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";
import { initialState } from "@/lib/workspace-state/state";
import { normalizeItem } from "./workspace-item-model";

/**
 * Event Reducer: Pure function that applies an event to state
 * This is the heart of event sourcing - state is derived by reducing events
 */
export function eventReducer(
  state: WorkspaceState,
  event: WorkspaceEvent,
): WorkspaceState {
  switch (event.type) {
    case "ITEM_CREATED": {
      const item = normalizeItem(event.payload.item);
      const now = event.timestamp || Date.now();
      return {
        ...state,
        items: [...state.items, { ...item, lastModified: now }],
      };
    }

    case "ITEM_UPDATED": {
      const now = event.timestamp || Date.now();
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === event.payload.id
            ? normalizeItem({
                ...item,
                ...event.payload.changes,
                // Deep merge data field to preserve existing properties like sources
                data: event.payload.changes.data
                  ? {
                      ...item.data, // Preserve existing data properties
                      ...event.payload.changes.data, // Apply new data updates
                    }
                  : item.data,
                lastModified: now,
              })
            : item,
        ),
      };
    }

    case "BULK_ITEMS_PATCHED": {
      const now = event.timestamp || Date.now();
      const updateMap = new Map(
        event.payload.updates.map((update) => [update.id, update]),
      );

      return {
        ...state,
        items: state.items.map((item) => {
          const update = updateMap.get(item.id);
          if (!update) return item;

          return normalizeItem({
            ...item,
            ...update.changes,
            data: update.changes.data
              ? {
                  ...item.data,
                  ...update.changes.data,
                }
              : item.data,
            lastModified: now,
          });
        }),
      };
    }

    case "ITEM_DELETED": {
      const deletedItemId = event.payload.id;
      const deletedItem = state.items.find((item) => item.id === deletedItemId);
      const isFolder = deletedItem?.type === "folder";

      return {
        ...state,
        items: state.items
          .filter((item) => item.id !== deletedItemId)
          // If deleting a folder-type item, clear folderId and layout from items that were in it
          // Layout is cleared so items get fresh positioning in root (same as when moving to folder)
          .map((item) =>
            isFolder && item.folderId === deletedItemId
              ? { ...item, folderId: undefined, layout: undefined }
              : item,
          ),
      };
    }

    case "BULK_ITEMS_UPDATED": {
      const p = event.payload;
      const now = event.timestamp || Date.now();

      // Bulk delete: send only deletedIds – no item data
      if (p.deletedIds && p.deletedIds.length > 0) {
        const deletedSet = new Set(p.deletedIds);
        const deletedFolderIds = new Set(
          state.items
            .filter((i) => deletedSet.has(i.id) && i.type === "folder")
            .map((i) => i.id),
        );
        const remaining = state.items
          .filter((i) => !deletedSet.has(i.id))
          .map((item) =>
            item.folderId && deletedFolderIds.has(item.folderId)
              ? { ...item, folderId: undefined, layout: undefined }
              : item,
          );
        return { ...state, items: remaining };
      }

      // Items added: send only addedItems
      if (p.addedItems && p.addedItems.length > 0) {
        const added = p.addedItems.map((item) =>
          normalizeItem({
            ...item,
            lastModified: now,
          }),
        );
        return { ...state, items: [...state.items, ...added] };
      }

      // Older events: full items snapshot
      if (p.items && p.items.length >= 0) {
        const newItemIds = new Set(p.items.map((i) => i.id));
        const deletedFolderIds = new Set(
          state.items
            .filter((i) => i.type === "folder" && !newItemIds.has(i.id))
            .map((i) => i.id),
        );
        const cleanedItems = p.items.map((item) =>
          normalizeItem(
            item.folderId && deletedFolderIds.has(item.folderId)
              ? { ...item, folderId: undefined, layout: undefined }
              : item,
          ),
        );
        return { ...state, items: cleanedItems };
      }

      // Layout-only: apply layout changes to existing items
      const layoutUpdates = p.layoutUpdates ?? [];
      if (layoutUpdates.length > 0) {
        const layoutMap = new Map(layoutUpdates.map((u) => [u.id, u]));
        return {
          ...state,
          items: state.items.map((item) => {
            const u = layoutMap.get(item.id);
            return u
              ? { ...item, layout: { x: u.x, y: u.y, w: u.w, h: u.h } }
              : item;
          }),
        };
      }

      return state;
    }

    case "BULK_ITEMS_CREATED": {
      const now = event.timestamp || Date.now();
      const itemsWithModified = event.payload.items.map((item) =>
        normalizeItem({
          ...item,
          lastModified: now,
        }),
      );
      return {
        ...state,
        items: [...state.items, ...itemsWithModified],
      };
    }

    case "FOLDER_CREATED":
      return state;

    case "FOLDER_UPDATED":
      return state;

    case "FOLDER_DELETED": {
      // Historical event: clear folderId from items that pointed at the removed folder id
      const deletedFolderId = event.payload.id;
      return {
        ...state,
        items: state.items.map((item) =>
          item.folderId === deletedFolderId
            ? { ...item, folderId: undefined }
            : item,
        ),
      };
    }

    case "ITEM_MOVED_TO_FOLDER": {
      // Clear layout when item moves to a new folder so it gets fresh positioning
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === event.payload.itemId
            ? {
                ...item,
                folderId: event.payload.folderId ?? undefined,
                layout: undefined, // Clear layout for fresh positioning in new folder
              }
            : item,
        ),
      };
    }

    case "ITEMS_MOVED_TO_FOLDER": {
      const itemIdsSet = new Set(event.payload.itemIds);
      const targetFolderId = event.payload.folderId ?? undefined;
      // Clear layout when items move to a new folder so they get fresh positioning
      const updatedItems = state.items.map((item) =>
        itemIdsSet.has(item.id)
          ? {
              ...item,
              folderId: targetFolderId,
              layout: undefined, // Clear layout for fresh positioning in new folder
            }
          : item,
      );
      return {
        ...state,
        items: updatedItems,
      };
    }

    case "FOLDER_CREATED_WITH_ITEMS": {
      const now = event.timestamp || Date.now();
      const folder = normalizeItem({ ...event.payload.folder, lastModified: now });
      const itemIdsSet = new Set(event.payload.itemIds);
      const folderId = folder.id;

      // Add the folder to items, then update items to move them into the folder
      const updatedItems = state.items.map((item) =>
        itemIdsSet.has(item.id)
          ? {
              ...item,
              folderId: folderId,
              layout: undefined,
              lastModified: now,
            }
          : item,
      );

      updatedItems.push(folder);

      return {
        ...state,
        items: updatedItems,
      };
    }

    default:
      // Exhaustive check - TypeScript will error if we miss an event type
      // If you get a type error here, you need to handle a new event type above
      return state;
  }
}

/**
 * Replay events to derive current state
 * This is a pure function - same events always produce same state
 *
 * @param events - Events to replay
 * @param workspaceId - Workspace ID to set in state
 * @param baseState - Optional starting state for offline utilities that resume from a known checkpoint
 */
export function replayEvents(
  events: WorkspaceEvent[],
  workspaceId?: string,
  baseState?: WorkspaceState,
): WorkspaceState {
  const replayStart = performance.now();

  const initialReplayState = baseState || {
    ...initialState,
    workspaceId: workspaceId || initialState.workspaceId,
  };

  const finalState = events.reduce(eventReducer, initialReplayState);

  const replayTime = performance.now() - replayStart;
  // Only log if replay is slow (>50ms) or if we're replaying many events (>100)
  // This reduces log noise from fast, frequent replays during optimistic updates
  if (replayTime > 50 || events.length > 100) {
    // Logging removed - use logger if needed
  }

  return finalState;
}

/**
 * Validate event ordering and consistency
 */
export function validateEvents(events: WorkspaceEvent[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check chronological order
  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      errors.push(`Event ${i} has timestamp before event ${i - 1}`);
    }
  }

  // Check for duplicate event IDs
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.id)) {
      errors.push(`Duplicate event ID: ${event.id}`);
    }
    ids.add(event.id);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
