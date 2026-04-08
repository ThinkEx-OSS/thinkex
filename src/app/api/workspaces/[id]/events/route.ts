import { NextRequest, NextResponse } from "next/server";
import type { WorkspaceEvent, EventResponse } from "@/lib/workspace/events";
import { hasDuplicateName } from "@/lib/workspace/unique-name";
import { db, workspaceEvents } from "@/lib/db/client";
import { eq, gt, asc, sql, and } from "drizzle-orm";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { broadcastWorkspaceEventFromServer } from "@/lib/realtime/server-broadcast";
import { loadWorkspaceItemsState } from "@/lib/workspace/workspace-items-projection";
import {
  appendWorkspaceEventWithProjection,
} from "@/lib/workspace/workspace-event-store";

/**
 * GET /api/workspaces/[id]/events
 * Fetch all events for a workspace (owner or collaborator)
 */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();

  const paramsResolved = await paramsPromise;
  const id = paramsResolved.id;

  const authStart = Date.now();
  const userId = await authPromise;
  timings.auth = Date.now() - authStart;

  // Check if user has access (owner or collaborator)
  const workspaceCheckStart = Date.now();
  await verifyWorkspaceAccess(id, userId, "viewer");
  timings.workspaceCheck = Date.now() - workspaceCheckStart;

  // Snapshots are deprecated from the normal event-history path.
  const countStart = Date.now();
  const eventCountResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceEvents)
    .where(eq(workspaceEvents.workspaceId, id));
  const eventCount = eventCountResult[0]?.count ?? 0;
  timings.countQuery = Date.now() - countStart;

  const PAGE_SIZE = 1000;
  let eventsData: any[] = [];

  if (eventCount === 0) {
    timings.eventsFetch = 0;
  } else if (eventCount <= PAGE_SIZE) {
    // If we have fewer events than PAGE_SIZE, fetch all at once (no pagination needed)
    const eventsFetchStart = Date.now();

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
          ${0}::integer,
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
  const events: WorkspaceEvent[] = eventsData.map(
    (e) =>
      ({
        type: e.eventType,
        payload: e.payload,
        timestamp: Number.isFinite(Number(e.timestamp))
          ? Number(e.timestamp)
          : Date.now(),
        userId: e.userId,
        userName: e.userName || undefined,
        id: e.eventId,
        version: e.version,
      }) as WorkspaceEvent,
  );
  timings.transform = Date.now() - transformStart;

  // Version should be the max version from database, not events.length
  const maxVersion =
    eventsData && eventsData.length > 0
      ? Math.max(...eventsData.map((e) => e.version))
      : 0;

  const response: EventResponse = {
    events,
    version: maxVersion,
  };

  const totalTime = Date.now() - startTime;
  timings.total = totalTime;

  return NextResponse.json(response);
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/[id]/events",
);

/**
 * POST /api/workspaces/[id]/events
 * Append new event(s) to workspace event log (owner only)
 */
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();
  const bodyPromise = request.json();

  const paramsResolved = await paramsPromise;
  const id = paramsResolved.id;

  const authStart = Date.now();
  const userId = await authPromise;
  timings.auth = Date.now() - authStart;

  const bodyStart = Date.now();
  const body = await bodyPromise;
  timings.bodyParse = Date.now() - bodyStart;
  const { event, baseVersion } = body;

  if (!event || baseVersion === undefined || isNaN(baseVersion)) {
    return NextResponse.json(
      { error: "Event and valid baseVersion are required" },
      { status: 400 },
    );
  }

  // Check if user has editor access (owner or editor collaborator)
  const workspaceCheckStart = Date.now();
  await verifyWorkspaceAccess(id, userId, "editor");
  timings.workspaceCheck = Date.now() - workspaceCheckStart;

  // Validate unique name for ITEM_CREATED and ITEM_UPDATED (when name changes)
  if (event.type === "ITEM_CREATED") {
    const item = event.payload?.item;
    if (item?.name != null && item?.type) {
      const state = await loadWorkspaceItemsState(id);
      if (
        hasDuplicateName(
          state.items,
          item.name,
          item.type,
          item.folderId ?? null,
        )
      ) {
        return NextResponse.json(
          {
            error: `A ${item.type} named "${item.name}" already exists in this folder`,
          },
          { status: 400 },
        );
      }
    }
  }
  if (event.type === "ITEM_UPDATED" && event.payload?.changes?.name != null) {
    const itemId = event.payload?.id;
    const newName = event.payload.changes.name;
    if (itemId && newName) {
      const state = await loadWorkspaceItemsState(id);
      const existingItem = state.items.find(
        (i: { id: string }) => i.id === itemId,
      );
      if (existingItem) {
        const newFolderId =
          event.payload.changes.folderId ?? existingItem.folderId ?? null;
        if (
          hasDuplicateName(
            state.items,
            newName,
            existingItem.type,
            newFolderId,
            itemId,
          )
        ) {
          return NextResponse.json(
            {
              error: `A ${existingItem.type} named "${newName}" already exists in this folder`,
            },
            { status: 400 },
          );
        }
      }
    }
  }

  // Use the append function to handle versioning and conflicts
  const appendStart = Date.now();
  const appendResult = await appendWorkspaceEventWithProjection({
    workspaceId: id,
    event,
    baseVersion,
  });
  timings.appendFunction = Date.now() - appendStart;

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
          gt(workspaceEvents.version, baseVersion),
        ),
      )
      .orderBy(asc(workspaceEvents.version));
    timings.conflictFetch = Date.now() - conflictFetchStart;

    const events: WorkspaceEvent[] = currentEvents.map(
      (e) =>
        ({
          type: e.eventType,
          payload: e.payload,
          timestamp: Number.isFinite(Number(e.timestamp))
            ? Number(e.timestamp)
            : Date.now(),
          userId: e.userId,
          userName: e.userName || undefined,
          id: e.eventId,
        }) as WorkspaceEvent,
    );

    const totalTime = Date.now() - startTime;
    timings.total = totalTime;

    return NextResponse.json({
      conflict: true,
      version: appendResult.version,
      currentEvents: events,
    });
  }

  await broadcastWorkspaceEventFromServer(id, {
    ...event,
    version: appendResult.version,
  });

  const totalTime = Date.now() - startTime;
  timings.total = totalTime;

  return NextResponse.json({
    success: true,
    version: appendResult.version,
    conflict: false,
  });
}

export const POST = withErrorHandling(
  handlePOST,
  "POST /api/workspaces/[id]/events",
);
