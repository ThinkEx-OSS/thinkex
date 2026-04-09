import type { Item } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
/** Payload shape for historical FOLDER_* events (folders are items today; replay still parses these). */
type FolderEventRecord = {
  id: string;
  name: string;
  color?: CardColor;
  createdAt: number;
  layout?: { x: number; y: number; w: number; h: number };
};

/**
 * Event Sourcing: All workspace changes are represented as immutable events.
 * The event log remains the canonical mutation history, while projection tables
 * serve current-state reads.
 */

type LegacyWorkspaceCompatibilityEvent =
  | {
      type: "WORKSPACE_CREATED";
      payload: { title: string; description: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "GLOBAL_TITLE_SET";
      payload: { title: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "GLOBAL_DESCRIPTION_SET";
      payload: { description: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "WORKSPACE_SNAPSHOT";
      payload: Item[] | { items?: Item[] };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    };

type WorkspaceEventBase =
  | LegacyWorkspaceCompatibilityEvent
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
        /** IDs of items to delete – minimal payload for bulk delete (no item data sent) */
        deletedIds?: string[];
        /** New items to append – only the added items, not full list */
        addedItems?: Item[];
        /** Full items payload from older bulk-update events. */
        items?: Item[];
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
      type: "FOLDER_CREATED";
      payload: { folder: FolderEventRecord };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "FOLDER_UPDATED";
      payload: {
        id: string;
        changes: Partial<FolderEventRecord>;
        name?: string;
      };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "FOLDER_DELETED";
      payload: { id: string; name?: string };
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "ITEM_MOVED_TO_FOLDER";
      payload: { itemId: string; folderId: string | null; itemName?: string }; // null = remove from folder
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
      }; // Bulk operation
      timestamp: number;
      userId: string;
      userName?: string;
      id: string;
    }
  | {
      type: "FOLDER_CREATED_WITH_ITEMS";
      payload: { folder: Item; itemIds: string[] }; // Create folder and move items atomically
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

/**
 * Event log with version for conflict detection
 */
export interface EventLog {
  workspaceId: string;
  events: WorkspaceEvent[];
  version: number; // Increments with each event
}

/**
 * Response from event API
 */
export interface EventResponse {
  events: WorkspaceEvent[];
  version: number;
  conflict?: boolean;
  currentEvents?: WorkspaceEvent[];
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
