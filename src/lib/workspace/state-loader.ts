import { db, workspaceEvents } from "@/lib/db/client";
import { eq, asc } from "drizzle-orm";
import { replayEvents } from "./event-reducer";
import type { Item } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";
import { initialItems } from "@/lib/workspace-state/state";

/** Load current workspace items by replaying all events. */
export async function loadWorkspaceState(workspaceId: string): Promise<Item[]> {
  try {
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
    return replayEvents(workspaceEvents_typed);
  } catch (error) {
    console.error("Error loading workspace state from events:", error);
    return initialItems;
  }
}
