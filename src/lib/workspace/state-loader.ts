import { db, type Database, workspaceEvents } from "@/lib/db/client";
import { asc, eq } from "drizzle-orm";
import { replayEvents } from "./event-reducer";
import { normalizeItems } from "./workspace-item-model";
import type { WorkspaceEvent as WorkspaceEventRow } from "@/lib/db/types";
import { initialState } from "@/lib/workspace-state/state";
import type { WorkspaceState } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";

/** DB or Drizzle transaction (same ops used by loaders). */
type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function mapWorkspaceEventRow(e: WorkspaceEventRow): WorkspaceEvent {
  return {
    type: e.eventType,
    payload: e.payload,
    timestamp: e.timestamp,
    userId: e.userId,
    userName: e.userName || undefined,
    id: e.eventId,
    version: e.version,
  } as WorkspaceEvent;
}

export function applyEventsToWorkspaceState(
  baseState: WorkspaceState,
  events: WorkspaceEvent[],
  workspaceId: string,
): WorkspaceState {
  const currentState = replayEvents(events, workspaceId, baseState);

  return {
    ...currentState,
    items: normalizeItems(currentState.items),
  };
}

/** Load current workspace state by replaying the full event stream. */
export async function loadWorkspaceState(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<WorkspaceState> {
  try {
    // Replay the authoritative event stream directly.
    const events = await executor
      .select()
      .from(workspaceEvents)
      .where(eq(workspaceEvents.workspaceId, workspaceId))
      .orderBy(asc(workspaceEvents.version));

    // Transform to WorkspaceEvent format
    const workspaceEvents_typed: WorkspaceEvent[] = events.map(mapWorkspaceEventRow);

    // Replay events to get current state
    return applyEventsToWorkspaceState(
      {
        ...initialState,
        workspaceId,
      },
      workspaceEvents_typed,
      workspaceId,
    );
  } catch (error) {
    console.error("Error loading workspace state from events:", error);
    
    // Fallback to empty state if event loading fails
    return {
      items: [],
      workspaceId: workspaceId,
    };
  }
}
