import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { WorkspaceEvent, EventResponse } from "@/lib/workspace/events";
import { checkAndCreateSnapshot } from "@/lib/workspace/snapshot-manager";
import { db, workspaces, workspaceEvents, workspaceSnapshots } from "@/lib/db/client";
import { eq, gt, desc, asc, sql, and } from "drizzle-orm";

/**
 * GET /api/workspaces/[id]/events
 * Fetch all events for a workspace (owner only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  let id: string | undefined;

  try {
    const paramsResolved = await params;
    id = paramsResolved.id;

    const authStart = Date.now();
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    timings.auth = Date.now() - authStart;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if user is workspace owner
    const workspaceCheckStart = Date.now();
    const workspace = await db
      .select({ userId: workspaces.userId })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    timings.workspaceCheck = Date.now() - workspaceCheckStart;

    if (!workspace[0]) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Enforce strict ownership (sharing is fork-based)
    if (workspace[0].userId !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get only the latest snapshot (not all snapshots - loaded on demand for version history)
    // Use optimized function that bypasses RLS (access already verified above)
    const snapshotStart = Date.now();
    const latestSnapshotData = await db.execute(sql`
      SELECT 
        id,
        snapshot_version as "snapshotVersion",
        state,
        event_count as "eventCount",
        created_at as "createdAt"
      FROM get_latest_snapshot_fast(${id}::uuid)
    `);
    timings.snapshotFetch = Date.now() - snapshotStart;

    const latestSnapshot = latestSnapshotData[0] as {
      id?: string;
      snapshotVersion?: number;
      state?: any;
      eventCount?: number;
      createdAt?: string;
    } | undefined;
    const snapshotVersion = typeof latestSnapshot?.snapshotVersion === 'number'
      ? latestSnapshot.snapshotVersion
      : 0;

    // Check how many events we need to fetch
    const countStart = Date.now();
    const eventCountResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceEvents)
      .where(
        and(
          eq(workspaceEvents.workspaceId, id),
          gt(workspaceEvents.version, snapshotVersion)
        )
      );
    const eventCount = eventCountResult[0]?.count ?? 0;
    timings.countQuery = Date.now() - countStart;

    // Only fetch events AFTER the snapshot version
    const PAGE_SIZE = 1000;
    let eventsData: any[] = [];

    if (eventCount === 0) {
      timings.eventsFetch = 0;
    } else if (eventCount <= PAGE_SIZE) {
      // If we have fewer events than PAGE_SIZE, fetch all at once (no pagination needed)
      const eventsFetchStart = Date.now();

      // Use optimized function that bypasses RLS (access already verified above)
      const queryStart = Date.now();
      const fastQueryResult = await db.execute(sql`
        SELECT 
          event_id as "eventId",
          event_type as "eventType",
          payload,
          timestamp,
          user_id as "userId",
          user_name as "userName",
          version
        FROM get_workspace_events_fast(
          ${id}::uuid,
          ${snapshotVersion}::integer,
          ${PAGE_SIZE}::integer
        )
      `);
      const queryTime = Date.now() - queryStart;

      // Transform result to match expected format
      eventsData = fastQueryResult.map((row: any) => ({
        eventId: row.eventId,
        eventType: row.eventType,
        payload: row.payload,
        timestamp: row.timestamp,
        userId: row.userId,
        userName: row.userName,
        version: row.version,
      }));
      timings.eventsFetch = Date.now() - eventsFetchStart;
      timings.eventsQuery = queryTime;
      timings.eventsDataProcessing = timings.eventsFetch - queryTime;
    } else {
      // Only paginate if we have more than PAGE_SIZE events
      const eventsFetchStart = Date.now();
      let allEvents: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const pageDataResult = await db.execute(sql`
          SELECT 
            event_id as "eventId",
            event_type as "eventType",
            payload,
            timestamp,
            user_id as "userId",
            user_name as "userName",
            version
          FROM workspace_events
          WHERE workspace_id = ${id}::uuid
            AND version > ${snapshotVersion}
          ORDER BY version ASC
          LIMIT ${PAGE_SIZE}
          OFFSET ${page * PAGE_SIZE}
        `);

        const pageData = pageDataResult.map((row: any) => ({
          eventId: row.eventId,
          eventType: row.eventType,
          payload: row.payload,
          timestamp: row.timestamp,
          userId: row.userId,
          userName: row.userName,
          version: row.version,
        }));

        allEvents = allEvents.concat(pageData);
        hasMore = pageData.length === PAGE_SIZE;
        page++;
      }

      eventsData = allEvents;
      timings.eventsFetch = Date.now() - eventsFetchStart;
    }

    // Transform database events to WorkspaceEvent format
    const transformStart = Date.now();
    const events: WorkspaceEvent[] = eventsData.map((e) => ({
      type: e.eventType,
      payload: e.payload,
      timestamp: e.timestamp,
      userId: e.userId,
      userName: e.userName || undefined,
      id: e.eventId,
      version: e.version,  // Include version from database
    } as WorkspaceEvent));
    timings.transform = Date.now() - transformStart;

    // Version should be the max version from database, not events.length
    const maxVersion = eventsData && eventsData.length > 0
      ? Math.max(...eventsData.map(e => e.version))
      : (snapshotVersion || 0);

    const response: EventResponse = {
      events,
      version: maxVersion,
      snapshot: latestSnapshot && typeof latestSnapshot.snapshotVersion === 'number' ? {
        version: latestSnapshot.snapshotVersion,
        state: latestSnapshot.state as any,
      } : undefined,
    };

    const totalTime = Date.now() - startTime;
    timings.total = totalTime;

    return NextResponse.json(response);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[GET /api/workspaces/${id || '[unknown]'}/events] Error after ${totalTime}ms:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/workspaces/[id]/events
 * Append new event(s) to workspace event log (owner only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  let id: string | undefined;

  try {
    const paramsResolved = await params;
    id = paramsResolved.id;

    const authStart = Date.now();
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    timings.auth = Date.now() - authStart;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const bodyStart = Date.now();
    const body = await request.json();
    timings.bodyParse = Date.now() - bodyStart;
    const { event, baseVersion } = body;

    if (!event || baseVersion === undefined || isNaN(baseVersion)) {
      return NextResponse.json(
        { error: "Event and valid baseVersion are required" },
        { status: 400 }
      );
    }

    // Check if user is workspace owner
    const workspaceCheckStart = Date.now();
    const workspace = await db
      .select({ userId: workspaces.userId })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    timings.workspaceCheck = Date.now() - workspaceCheckStart;

    if (!workspace[0]) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Enforce strict ownership (sharing is fork-based)
    if (workspace[0].userId !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Use the append function to handle versioning and conflicts
    const appendStart = Date.now();
    const result = await db.execute(sql`
      SELECT append_workspace_event(
        ${id}::uuid,
        ${event.id}::text,
        ${event.type}::text,
        ${JSON.stringify(event.payload)}::jsonb,
        ${event.timestamp}::bigint,
        ${event.userId}::text,
        ${baseVersion}::integer,
        ${event.userName || null}::text
      ) as result
    `);
    timings.appendFunction = Date.now() - appendStart;

    if (!result || result.length === 0 || !result[0]) {
      return NextResponse.json({ error: "Failed to append event" }, { status: 500 });
    }

    // PostgreSQL returns result as string like "(6,t)" - need to parse it
    const rawResult = result[0].result as string;

    // Parse the PostgreSQL tuple format "(version,conflict)"
    const match = rawResult.match(/\((\d+),(t|f)\)/);
    if (!match) {
      console.error(`[POST /api/workspaces/${id}/events] Failed to parse PostgreSQL result:`, rawResult);
      return NextResponse.json({ error: "Invalid database response" }, { status: 500 });
    }

    const appendResult = {
      version: parseInt(match[1], 10),
      conflict: match[2] === 't'
    };

    // Check for conflict
    if (appendResult.conflict) {
      // Fetch current events for client to merge
      const conflictFetchStart = Date.now();
      const currentEvents = await db
        .select()
        .from(workspaceEvents)
        .where(
          and(
            eq(workspaceEvents.workspaceId, id),
            gt(workspaceEvents.version, baseVersion)
          )
        )
        .orderBy(asc(workspaceEvents.version));
      timings.conflictFetch = Date.now() - conflictFetchStart;

      const events: WorkspaceEvent[] = currentEvents.map((e) => ({
        type: e.eventType,
        payload: e.payload,
        timestamp: e.timestamp,
        userId: e.userId,
        userName: e.userName || undefined,
        id: e.eventId,
      } as WorkspaceEvent));

      const totalTime = Date.now() - startTime;
      timings.total = totalTime;

      return NextResponse.json({
        conflict: true,
        version: appendResult.version,
        currentEvents: events,
      });
    }

    // Success - no conflict
    // Check if we need to create a snapshot (async, non-blocking)
    checkAndCreateSnapshot(id).catch((err) => {
      console.error(`[POST /api/workspaces/${id}/events] Failed to create snapshot:`, err);
      // Don't fail the request if snapshot creation fails
    });

    const totalTime = Date.now() - startTime;
    timings.total = totalTime;

    return NextResponse.json({
      success: true,
      version: appendResult.version,
      conflict: false,
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[POST /api/workspaces/${id || '[unknown]'}/events] Error after ${totalTime}ms:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

