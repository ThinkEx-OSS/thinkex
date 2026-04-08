import { db, workspaceEvents } from "@/lib/db/client";
import { eq, asc } from "drizzle-orm";
import { replayEvents } from "./event-reducer";
import type { WorkspaceState } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";

/**
 * Load current workspace state by replaying the full event stream.
 * Snapshots are deprecated from the normal read path; recovery tooling can still
 * use them explicitly when needed.
 */
export async function loadWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
  try {
    // Replay the authoritative event stream directly.
    const events = await db
      .select()
      .from(workspaceEvents)
      .where(eq(workspaceEvents.workspaceId, workspaceId))
      .orderBy(asc(workspaceEvents.version));

    // Transform to WorkspaceEvent format
    const workspaceEvents_typed: WorkspaceEvent[] = events.map((e: any) => ({
      type: e.eventType,
      payload: e.payload,
      timestamp: e.timestamp,
      userId: e.userId,
      userName: e.userName || undefined,
      id: e.eventId,
      version: e.version,
    } as WorkspaceEvent));

    // Replay events to get current state
    const currentState = replayEvents(workspaceEvents_typed, workspaceId);

    return currentState;
  } catch (error) {
    console.error("Error loading workspace state from events:", error);
    
    // Fallback to empty state if event loading fails
    return {
      items: [],
      workspaceId: workspaceId,
    };
  }
}
