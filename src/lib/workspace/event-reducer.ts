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
        globalDescription: event.payload.description,
      };

    case 'ITEM_CREATED':
      const isFolder = event.payload.item.type === 'folder';
      return {
        ...state,
        items: [...state.items, event.payload.item],
      };

    case 'ITEM_UPDATED':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === event.payload.id
            ? {
              ...item,
              ...event.payload.changes,
              lastSource: event.payload.source // Propagate source to item state
            }
            : item
        ),
      };

    case 'ITEM_DELETED': {
      const deletedItemId = event.payload.id;
      const deletedItem = state.items.find(item => item.id === deletedItemId);
      const isFolder = deletedItem?.type === 'folder';

      return {
        ...state,
        items: state.items
          .filter(item => item.id !== deletedItemId)
          // If deleting a folder-type item, clear folderId from items that were in it
          .map(item => (isFolder && item.folderId === deletedItemId)
            ? { ...item, folderId: undefined }
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
      return {
        ...state,
        globalDescription: event.payload.description,
      };


    case 'WORKSPACE_SNAPSHOT':
      // Used for migration from old workspace_states table
      // Replaces entire state with snapshot
      return {
        ...event.payload,
        workspaceId: state.workspaceId, // Preserve workspace ID
      };

    case 'BULK_ITEMS_UPDATED':
      // Used for layout changes (drag/resize) and reordering
      // Support both new format (layoutUpdates only) and legacy format (full items array)
      if (event.payload.items) {
        // Legacy format: full items array (for backwards compatibility)
        return {
          ...state,
          items: event.payload.items,
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

    case 'BULK_ITEMS_CREATED':
      // Create multiple items atomically in a single event
      return {
        ...state,
        items: [...state.items, ...event.payload.items],
      };



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
      // Create folder and move items atomically in a single operation
      const folder = event.payload.folder;
      const itemIdsSet = new Set(event.payload.itemIds);
      const folderId = folder.id;

      // Add the folder to items, then update items to move them into the folder
      const updatedItems = state.items
        .map(item =>
          itemIdsSet.has(item.id)
            ? {
              ...item,
              folderId: folderId,
              layout: undefined // Clear layout for fresh positioning in new folder
            }
            : item
        );

      // Add the folder item itself
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

