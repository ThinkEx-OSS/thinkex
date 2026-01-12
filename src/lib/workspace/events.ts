import type { Item, AgentState, Folder } from "@/lib/workspace-state/types";
import type { WorkspaceSnapshot } from '@/lib/db/types';

/**
 * Event Sourcing: All workspace changes are represented as immutable events
 * State is derived by replaying events in order
 */

type WorkspaceEventBase =
  | {
    type: 'WORKSPACE_CREATED';
    payload: { title: string; description: string };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'ITEM_CREATED';
    payload: { id: string; item: Item };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'ITEM_UPDATED';
    payload: { id: string; changes: Partial<Item>; source?: 'user' | 'agent' };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'ITEM_DELETED';
    payload: { id: string };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'GLOBAL_TITLE_SET';
    payload: { title: string };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'GLOBAL_DESCRIPTION_SET';
    payload: { description: string };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'WORKSPACE_SNAPSHOT';
    payload: AgentState;
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'BULK_ITEMS_UPDATED';
    // Store only layout changes to minimize payload size (was storing full items array)
    payload: {
      layoutUpdates: Array<{ id: string; x: number; y: number; w: number; h: number }>;
      previousItemCount?: number;
      // Legacy support: if items array is present, use it (for backwards compatibility)
      items?: Item[];
    };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'BULK_ITEMS_CREATED';
    // Create multiple items atomically in a single event
    payload: { items: Item[] };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }

  | {
    type: 'FOLDER_CREATED';
    payload: { folder: Folder };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'FOLDER_UPDATED';
    payload: { id: string; changes: Partial<Folder> };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'FOLDER_DELETED';
    payload: { id: string };
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'ITEM_MOVED_TO_FOLDER';
    payload: { itemId: string; folderId: string | null }; // null = remove from folder
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'ITEMS_MOVED_TO_FOLDER';
    payload: { itemIds: string[]; folderId: string | null }; // Bulk operation
    timestamp: number;
    userId: string;
    userName?: string;
    id: string;
  }
  | {
    type: 'FOLDER_CREATED_WITH_ITEMS';
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
  snapshot?: {
    version: number;
    state: AgentState;
  };
  snapshots?: SnapshotInfo[];  // All snapshots for version history
}

/**
 * Snapshot metadata for version history
 * Note: Different from WorkspaceSnapshot as it uses 'version' instead of 'snapshotVersion'
 */
export interface SnapshotInfo {
  id: string;
  version: number;
  eventCount: number;
  createdAt: string;
  state: AgentState;
}

/**
 * Response from event API
 */
export interface EventResponse {
  events: WorkspaceEvent[];
  version: number;
  conflict?: boolean;
  currentEvents?: WorkspaceEvent[];
  snapshot?: {
    version: number;
    state: AgentState;
  };
  snapshots?: SnapshotInfo[];  // All snapshots for version history
}

/**
 * Helper to create a new event with required fields
 */
export function createEvent<T extends WorkspaceEvent['type']>(
  type: T,
  payload: Extract<WorkspaceEvent, { type: T }>['payload'],
  userId: string,
  userName?: string
): Extract<WorkspaceEvent, { type: T }> {
  return {
    type,
    payload,
    timestamp: Date.now(),
    userId,
    userName,
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  } as Extract<WorkspaceEvent, { type: T }>;
}

