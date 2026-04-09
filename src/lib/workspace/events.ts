import type { Item } from "@/lib/workspace-state/types";

/**
 * Workspace mutations persisted for conflict resolution and realtime confirmation.
 * Current state is loaded from projection tables, not reconstructed from this log.
 */

type WorkspaceEventBase =
  | {
      type: "ITEM_CREATED";
      payload: { id: string; item: Item };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "ITEM_UPDATED";
      payload: { id: string; changes: Partial<Item>; name?: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "BULK_ITEMS_PATCHED";
      payload: {
        updates: Array<{
          id: string;
          changes: Partial<Item>;
          name?: string;
        }>;
      };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "ITEM_DELETED";
      payload: { id: string; name?: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "BULK_ITEMS_UPDATED";
      payload: {
        layoutUpdates?: Array<{
          id: string;
          x: number;
          y: number;
          w: number;
          h: number;
        }>;
        previousItemCount?: number;
        deletedIds?: string[];
        addedItems?: Item[];
      };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "BULK_ITEMS_CREATED";
      // Create multiple items atomically in a single event
      payload: { items: Item[] };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "ITEM_MOVED_TO_FOLDER";
      payload: { itemId: string; folderId: string | null; itemName?: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "ITEMS_MOVED_TO_FOLDER";
      payload: {
        itemIds: string[];
        folderId: string | null;
        itemNames?: string[];
      };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "FOLDER_CREATED_WITH_ITEMS";
      payload: { folder: Item; itemIds: string[] };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    };

/**
 * WorkspaceEvent with optional version field (populated from database)
 */
export type WorkspaceEvent = WorkspaceEventBase & {
  version?: number;
};

const CLIENT_VISIBLE_WORKSPACE_EVENT_TYPES = new Set<WorkspaceEvent["type"]>([
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "BULK_ITEMS_PATCHED",
  "ITEM_DELETED",
  "BULK_ITEMS_UPDATED",
  "BULK_ITEMS_CREATED",
  "ITEM_MOVED_TO_FOLDER",
  "ITEMS_MOVED_TO_FOLDER",
  "FOLDER_CREATED_WITH_ITEMS",
]);

export type ClientWorkspaceEvent = WorkspaceEvent;

export function isClientVisibleWorkspaceEvent(event: {
  type: string;
}): event is ClientWorkspaceEvent {
  return CLIENT_VISIBLE_WORKSPACE_EVENT_TYPES.has(
    event.type as WorkspaceEvent["type"],
  );
}

/**
 * Response from event API
 */
export interface EventResponse {
  events: ClientWorkspaceEvent[];
  version: number;
}

/**
 * Helper to create a new event with required fields
 */
export function createEvent<T extends WorkspaceEvent["type"]>(
  type: T,
  payload: Extract<WorkspaceEvent, { type: T }>["payload"],
  userId: string,
  userName?: string,
): Extract<WorkspaceEvent, { type: T }> {
  return {
    type,
    payload,
    timestamp: Date.now(),
    userId,
    userName,
    id: crypto.randomUUID(),
  } as Extract<WorkspaceEvent, { type: T }>;
}
