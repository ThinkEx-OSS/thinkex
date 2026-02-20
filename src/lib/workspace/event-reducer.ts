import type { AgentState } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";
import { initialState } from "@/lib/workspace-state/state";

/**
 * Event Reducer: Pure function that applies an event to state
 * This is the heart of event sourcing - state is derived by reducing events
 */
export function eventReducer(state: AgentState, event: WorkspaceEvent): AgentState {
  switch (event.type) {
    case 'WORKSPACE_CREATED':
      return {
        ...state,
        globalTitle: event.payload.title,
      };

    case 'ITEM_CREATED': {
      const item = event.payload.item;
      const now = event.timestamp || Date.now();
      return {
        ...state,
        items: [...state.items, { ...item, lastModified: now }],
      };
    }

    case 'ITEM_UPDATED': {
      const now = event.timestamp || Date.now();
      return {
        ...state,
        items: state.items.map(item =>
          item.id === event.payload.id
            ? {
              ...item,
              ...event.payload.changes,
              // Deep merge data field to preserve existing properties like sources
              data: event.payload.changes.data
                ? {
                  ...item.data, // Preserve existing data properties
                  ...event.payload.changes.data, // Apply new data updates
                }
                : item.data,
              lastSource: event.payload.source, // Propagate source to item state
              lastModified: now,
            }
            : item
        ),
      };
    }

    case 'ITEM_DELETED': {
      const deletedItemId = event.payload.id;
      const deletedItem = state.items.find(item => item.id === deletedItemId);
      const isFolder = deletedItem?.type === 'folder';

      return {
        ...state,
        items: state.items
          .filter(item => item.id !== deletedItemId)
          // If deleting a folder-type item, clear folderId and layout from items that were in it
          // Layout is cleared so items get fresh positioning in root (same as when moving to folder)
          .map(item => (isFolder && item.folderId === deletedItemId)
            ? { ...item, folderId: undefined, layout: undefined }
            : item
          ),
      };
    }

    case 'GLOBAL_TITLE_SET':
      return {
        ...state,
        globalTitle: event.payload.title,
      };

    case 'GLOBAL_DESCRIPTION_SET':
      // No-op: globalDescription removed from state
      return state;


    case 'WORKSPACE_SNAPSHOT':
      // Used for migration from old workspace_states table
      // Replaces entire state with snapshot
      return {
        ...event.payload,
        workspaceId: state.workspaceId, // Preserve workspace ID
      };

    case 'BULK_ITEMS_UPDATED': {
      // Used for layout changes (drag/resize), reordering, and bulk delete
      // Support both new format (layoutUpdates only) and legacy format (full items array)
      if (event.payload.items) {
        // Full items array format (used for bulk delete and item add/remove operations)
        const newItems = event.payload.items;

        // Find folders that were deleted (existed in old state but not in new state)
        const newItemIds = new Set(newItems.map(item => item.id));
        const deletedFolderIds = new Set(
          state.items
            .filter(item => item.type === 'folder' && !newItemIds.has(item.id))
            .map(item => item.id)
        );

        // If any folders were deleted, clear folderId and layout on orphaned items
        // This prevents items from pointing to non-existent folders
        // Layout is cleared so items get fresh positioning in root (same as when moving to folder)
        const cleanedItems = deletedFolderIds.size > 0
          ? newItems.map(item =>
            item.folderId && deletedFolderIds.has(item.folderId)
              ? { ...item, folderId: undefined, layout: undefined }
              : item
          )
          : newItems;

        return {
          ...state,
          items: cleanedItems,
        };
      } else {
        // New format: only layout changes - apply to existing items
        const layoutMap = new Map(
          event.payload.layoutUpdates.map(update => [update.id, update])
        );
        return {
          ...state,
          items: state.items.map(item => {
            const layoutUpdate = layoutMap.get(item.id);
            if (layoutUpdate) {
              return {
                ...item,
                layout: {
                  x: layoutUpdate.x,
                  y: layoutUpdate.y,
                  w: layoutUpdate.w,
                  h: layoutUpdate.h,
                },
              };
            }
            return item;
          }),
        };
      }
    }

    case 'BULK_ITEMS_CREATED': {
      const now = event.timestamp || Date.now();
      const itemsWithModified = event.payload.items.map((item) => ({
        ...item,
        lastModified: now,
      }));
      return {
        ...state,
        items: [...state.items, ...itemsWithModified],
      };
    }



    // =====================================================
    // FOLDER EVENTS (DEPRECATED - kept for backward compatibility)
    // Folders are now items with type: 'folder', so these events are no-ops
    // Old events in the database will be ignored
    // =====================================================

    case 'FOLDER_CREATED':
      // No-op: folders are now items with type: 'folder'
      // This event is kept for backward compatibility but does nothing
      return state;

    case 'FOLDER_UPDATED':
      // No-op: folders are now items with type: 'folder'
      // This event is kept for backward compatibility but does nothing
      return state;

    case 'FOLDER_DELETED': {
      // No-op: folders are now items with type: 'folder'
      // However, we still need to clear folderId from items that were in the deleted folder
      // This maintains backward compatibility with old events
      const deletedFolderId = event.payload.id;
      return {
        ...state,
        items: state.items.map(item =>
          item.folderId === deletedFolderId
            ? { ...item, folderId: undefined }
            : item
        ),
      };
    }

    case 'ITEM_MOVED_TO_FOLDER': {
      // Clear layout when item moves to a new folder so it gets fresh positioning
      return {
        ...state,
        items: state.items.map(item =>
          item.id === event.payload.itemId
            ? {
              ...item,
              folderId: event.payload.folderId ?? undefined,
              layout: undefined // Clear layout for fresh positioning in new folder
            }
            : item
        ),
      };
    }

    case 'ITEMS_MOVED_TO_FOLDER': {
      const itemIdsSet = new Set(event.payload.itemIds);
      const targetFolderId = event.payload.folderId ?? undefined;
      // Clear layout when items move to a new folder so they get fresh positioning
      const updatedItems = state.items.map(item =>
        itemIdsSet.has(item.id)
          ? {
            ...item,
            folderId: targetFolderId,
            layout: undefined // Clear layout for fresh positioning in new folder
          }
          : item
      );
      return {
        ...state,
        items: updatedItems,
      };
    }

    case 'FOLDER_CREATED_WITH_ITEMS': {
      const now = event.timestamp || Date.now();
      const folder = { ...event.payload.folder, lastModified: now };
      const itemIdsSet = new Set(event.payload.itemIds);
      const folderId = folder.id;

      // Add the folder to items, then update items to move them into the folder
      const updatedItems = state.items
        .map(item =>
          itemIdsSet.has(item.id)
            ? {
              ...item,
              folderId: folderId,
              layout: undefined,
              lastModified: now,
            }
            : item
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
 * @param snapshotState - Optional snapshot state to start from (optimization)
 */
export function replayEvents(
  events: WorkspaceEvent[],
  workspaceId?: string,
  snapshotState?: AgentState
): AgentState {
  const replayStart = performance.now();

  const baseState = snapshotState || {
    ...initialState,
    workspaceId: workspaceId || initialState.workspaceId,
  };

  const finalState = events.reduce(eventReducer, baseState);



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

