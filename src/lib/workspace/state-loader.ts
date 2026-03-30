import { db, workspaceEvents, workspaceSnapshots } from "@/lib/db/client";
import { eq, asc, desc, gt, and, sql } from "drizzle-orm";
import { replayEvents } from "./event-reducer";
import type { AgentState, Item } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";

// Event types that can affect folder items — used to skip unrelated events (e.g. OCR patches)
const FOLDER_AFFECTING_EVENT_TYPES = new Set([
  'ITEM_CREATED',
  'BULK_ITEMS_CREATED',
  'ITEM_UPDATED',
  'BULK_ITEMS_PATCHED',
  'ITEM_DELETED',
  'BULK_ITEMS_UPDATED',
  'FOLDER_CREATED_WITH_ITEMS',
  'ITEM_MOVED_TO_FOLDER',
  'ITEMS_MOVED_TO_FOLDER',
  'FOLDER_CREATED',   // deprecated, backward compat
  'FOLDER_UPDATED',   // deprecated no-op
  'FOLDER_DELETED',   // deprecated, clears folderId
  'WORKSPACE_SNAPSHOT', // full state replacement
]);

/**
 * Load only folder items using the fast DB functions used by the events route.
 * Skips events that cannot affect folders, avoiding full workspace reconstruction.
 */
export async function loadWorkspaceFolders(workspaceId: string): Promise<Item[]> {
  try {
    const latestSnapshotData = await db.execute(sql`
      SELECT
        snapshot_version as "snapshotVersion",
        state
      FROM get_latest_snapshot_fast(${workspaceId}::uuid)
    `);

    const latestSnapshot = latestSnapshotData[0] as {
      snapshotVersion?: number;
      state?: unknown;
    } | undefined;

    const snapshotVersion = typeof latestSnapshot?.snapshotVersion === 'number'
      ? latestSnapshot.snapshotVersion
      : 0;

    const PAGE_SIZE = 1000;

    const eventCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceEvents)
      .where(
        and(
          eq(workspaceEvents.workspaceId, workspaceId),
          gt(workspaceEvents.version, snapshotVersion)
        )
      );
    const eventCount = eventCountResult[0]?.count ?? 0;

    let eventsData: any[];

    if (eventCount === 0) {
      eventsData = [];
    } else if (eventCount <= PAGE_SIZE) {
      eventsData = (await db.execute(sql`
        SELECT
          event_id as "eventId",
          event_type as "eventType",
          payload,
          timestamp,
          user_id as "userId",
          user_name as "userName",
          version
        FROM get_workspace_events_fast(
          ${workspaceId}::uuid,
          ${snapshotVersion}::integer,
          ${PAGE_SIZE}::integer
        )
      `)) as any[];
    } else {
      let allEvents: any[] = [];
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const pageData = (await db.execute(sql`
          SELECT
            event_id as "eventId",
            event_type as "eventType",
            payload,
            timestamp,
            user_id as "userId",
            user_name as "userName",
            version
          FROM workspace_events
          WHERE workspace_id = ${workspaceId}::uuid
            AND version > ${snapshotVersion}
          ORDER BY version ASC
          LIMIT ${PAGE_SIZE}
          OFFSET ${page * PAGE_SIZE}
        `)) as any[];
        allEvents = allEvents.concat(pageData);
        hasMore = pageData.length === PAGE_SIZE;
        page++;
      }
      eventsData = allEvents;
    }

    const events = (eventsData as any[])
      .filter(e => FOLDER_AFFECTING_EVENT_TYPES.has(e.eventType))
      .map(e => ({
        type: e.eventType,
        payload: e.payload,
        timestamp: Number.isFinite(Number(e.timestamp)) ? Number(e.timestamp) : Date.now(),
        userId: e.userId,
        userName: e.userName || undefined,
        id: e.eventId,
        version: e.version,
      } as WorkspaceEvent));

    const currentState = replayEvents(events, workspaceId, latestSnapshot?.state as AgentState | undefined);

    return currentState.items.filter(item => item.type === 'folder');
  } catch (error) {
    console.error('Error loading workspace folders:', error);
    return [];
  }
}

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
      workspaceId: workspaceId,
    };
  }
}
