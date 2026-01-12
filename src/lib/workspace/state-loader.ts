import { db, workspaceEvents, workspaceSnapshots } from "@/lib/db/client";
import { eq, asc, desc, gt, and } from "drizzle-orm";
import { replayEvents } from "./event-reducer";
import type { AgentState } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";

/**
 * Load current workspace state by replaying events from the latest snapshot
 * This replaces direct reads from workspace_states table
 */
export async function loadWorkspaceState(workspaceId: string): Promise<AgentState> {
  try {
    // Get the latest snapshot for this workspace (highest version number)
    const latestSnapshot = await db
      .select()
      .from(workspaceSnapshots)
      .where(eq(workspaceSnapshots.workspaceId, workspaceId))
      .orderBy(desc(workspaceSnapshots.snapshotVersion))
      .limit(1);

    let baseState: AgentState | undefined;
    let fromVersion = 0;

    if (latestSnapshot[0]) {
      baseState = latestSnapshot[0].state as AgentState;
      fromVersion = latestSnapshot[0].snapshotVersion;
    }

    // Get all events since the snapshot (or all events if no snapshot)
    const events = await db
      .select()
      .from(workspaceEvents)
      .where(
        fromVersion > 0 
          ? and(eq(workspaceEvents.workspaceId, workspaceId), gt(workspaceEvents.version, fromVersion))
          : eq(workspaceEvents.workspaceId, workspaceId)
      )
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
    const currentState = replayEvents(workspaceEvents_typed, workspaceId, baseState);

    return currentState;
  } catch (error) {
    console.error("Error loading workspace state from events:", error);
    
    // Fallback to empty state if event loading fails
    return {
      items: [],
      globalTitle: "",
      globalDescription: "",
      itemsCreated: 0,
      workspaceId: workspaceId,
    };
  }
}
