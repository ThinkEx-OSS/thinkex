import { replayEvents } from "./event-reducer";
import type { WorkspaceEvent } from "./events";
import type { AgentState } from "@/lib/workspace-state/types";
import { db, workspaceEvents, workspaceSnapshots } from "@/lib/db/client";
import { eq, asc, desc, gt, and, sql } from "drizzle-orm";

/**
 * Configuration for snapshot creation
 */
export const SNAPSHOT_CONFIG = {
  // Create a snapshot every N events
  // Reduced from 100 to 50 for better performance with minimal overhead
  // Snapshot creation is async and non-blocking, so more frequent snapshots
  // improve load times without impacting user experience
  EVENTS_PER_SNAPSHOT: 50,
  // Keep N most recent snapshots per workspace
  MAX_SNAPSHOTS_PER_WORKSPACE: 3,
};

/**
 * Check if a workspace needs a new snapshot
 */
export async function checkNeedsSnapshot(
  workspaceId: string,
  threshold: number = SNAPSHOT_CONFIG.EVENTS_PER_SNAPSHOT
): Promise<{
  needsSnapshot: boolean;
  currentVersion: number;
  lastSnapshotVersion: number;
  eventsSinceSnapshot: number;
}> {
  const result = await db.execute(sql`
    SELECT * FROM needs_snapshot(${workspaceId}::uuid, ${threshold}::integer)
  `);

  if (!result || result.length === 0) {
    // Default to not needing snapshot if there's an error
    return {
      needsSnapshot: false,
      currentVersion: 0,
      lastSnapshotVersion: 0,
      eventsSinceSnapshot: 0,
    };
  }

  const data = result[0] as any;
  return {
    needsSnapshot: data.needs_snapshot,
    currentVersion: data.current_version,
    lastSnapshotVersion: data.last_snapshot_version,
    eventsSinceSnapshot: data.events_since_snapshot,
  };
}

/**
 * Create a snapshot for a workspace
 * This fetches all events, replays them to derive state, and saves the snapshot
 */
export async function createSnapshot(
  workspaceId: string
): Promise<{ success: boolean; version?: number; error?: string }> {
  try {
    // 1. Get the latest snapshot to use as a baseline
    const latestSnapshot = await db
      .select()
      .from(workspaceSnapshots)
      .where(eq(workspaceSnapshots.workspaceId, workspaceId))
      .orderBy(desc(workspaceSnapshots.snapshotVersion))
      .limit(1);

    let baseState: AgentState | undefined;
    let startVersion = 0;

    if (latestSnapshot && latestSnapshot.length > 0) {
      baseState = latestSnapshot[0].state as AgentState;
      startVersion = latestSnapshot[0].snapshotVersion;
    }

    // 2. Fetch only new events since the last snapshot
    // Use keyset pagination (seeking) instead of OFFSET for better performance
    const PAGE_SIZE = 1000;
    let allEvents: any[] = [];
    let hasMore = true;
    let lastSeenVersion = startVersion;

    while (hasMore) {
      const pageData = await db
        .select()
        .from(workspaceEvents)
        .where(
          and(
            eq(workspaceEvents.workspaceId, workspaceId),
            gt(workspaceEvents.version, lastSeenVersion)
          )
        )
        .orderBy(asc(workspaceEvents.version))
        .limit(PAGE_SIZE);

      if (pageData.length > 0) {
        allEvents = allEvents.concat(pageData);
        lastSeenVersion = pageData[pageData.length - 1].version;
      }

      hasMore = pageData.length === PAGE_SIZE;
    }

    if (allEvents.length === 0) {
      // No new events to snapshot
      return { success: true, version: startVersion };
    }

    // 3. Transform to WorkspaceEvent format
    const events: WorkspaceEvent[] = allEvents.map((e) => ({
      type: e.eventType as WorkspaceEvent["type"],
      payload: e.payload,
      timestamp: e.timestamp,
      userId: e.userId,
      userName: e.userName || undefined,
      id: e.eventId,
      version: e.version,
    }));

    // 4. Replay events to derive current state
    // If we have a base state, replayEvents will apply new events on top of it
    const state: AgentState = replayEvents(events, workspaceId, baseState);

    // Get max version
    const maxVersion = Math.max(...allEvents.map((e) => e.version));

    // Calculate total event count (previous count + new events)
    let totalEventCount = allEvents.length;
    if (latestSnapshot && latestSnapshot.length > 0) {
      totalEventCount += latestSnapshot[0].eventCount;
    }

    // Save snapshot using the PostgreSQL function
    // Note: create_workspace_snapshot returns a UUID (snapshot ID) on success
    const result = await db.execute(sql`
      SELECT create_workspace_snapshot(
        ${workspaceId}::uuid,
        ${JSON.stringify(state)}::jsonb,
        ${maxVersion}::integer,
        ${totalEventCount}::integer
      ) as result
    `);

    if (!result || result.length === 0) {
      return { success: false, error: "Failed to create snapshot: no result from database" };
    }

    const snapshotId = result[0].result as string | null | undefined;

    // The function returns a UUID on success, null/undefined on failure
    if (!snapshotId || typeof snapshotId !== 'string' || snapshotId.trim() === '') {
      console.error("Failed to create snapshot: function returned invalid result:", snapshotId);
      return { success: false, error: "Failed to create snapshot: invalid snapshot ID returned" };
    }

    return { success: true, version: maxVersion };
  } catch (error: any) {
    console.error("Error creating snapshot:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Check and create snapshot if needed
 * This is the main function to call after appending events
 */
export async function checkAndCreateSnapshot(
  workspaceId: string
): Promise<void> {
  try {
    const snapshotCheck = await checkNeedsSnapshot(workspaceId);

    if (snapshotCheck.needsSnapshot) {
      const result = await createSnapshot(workspaceId);
      if (!result.success) {
        console.error(`[SNAPSHOT] Failed to create snapshot:`, result.error);
      }
    }
  } catch (error) {
    // Don't throw - snapshot creation is an optimization, not critical
    console.error(`[SNAPSHOT] Error in checkAndCreateSnapshot for workspace ${workspaceId}:`, error);
  }
}
