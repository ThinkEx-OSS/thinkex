import { NextRequest, NextResponse } from "next/server";
import type { WorkspaceEvent, EventResponse } from "@/lib/workspace/events";
import { checkAndCreateSnapshot } from "@/lib/workspace/snapshot-manager";

/** Strip heavy OCR page payloads from OCR-backed items — client refetches item state as needed. */
function stripOcrPagesFromItem(item: { type?: string; data?: unknown }): void {
  if (
    (item?.type === "pdf" || item?.type === "image") &&
    item.data &&
    typeof item.data === "object"
  ) {
    const d = item.data as Record<string, unknown>;
    delete d.ocrPages;
  }
}

function stripOcrPagesFromState(
  state: { items?: Array<{ type?: string; data?: unknown }> } | undefined,
): void {
  state?.items?.forEach(stripOcrPagesFromItem);
}

function stripPdfOcrFromEventPayload(event: WorkspaceEvent): void {
  const p = event.payload as Record<string, unknown>;
  if (event.type === "ITEM_CREATED" && p?.item)
    stripOcrPagesFromItem(p.item as { type?: string; data?: unknown });
  if (event.type === "ITEM_UPDATED") {
    const changes = p?.changes as Record<string, unknown> | undefined;
    if (changes?.data && typeof changes.data === "object") {
      const d = changes.data as Record<string, unknown>;
      delete d.ocrPages;
    }
  }
  if (event.type === "BULK_ITEMS_PATCHED") {
    const updates = p?.updates as
      | Array<{ changes?: { data?: unknown } }>
      | undefined;
    updates?.forEach((update) => {
      if (update?.changes?.data && typeof update.changes.data === "object") {
        const d = update.changes.data as Record<string, unknown>;
        delete d.ocrPages;
      }
    });
  }
  if (event.type === "BULK_ITEMS_UPDATED") {
    (
      p?.addedItems as Array<{ type?: string; data?: unknown }> | undefined
    )?.forEach(stripOcrPagesFromItem);
    (p?.items as Array<{ type?: string; data?: unknown }> | undefined)?.forEach(
      stripOcrPagesFromItem,
    );
  }
  if (event.type === "WORKSPACE_SNAPSHOT" && p?.items) {
    (p.items as Array<{ type?: string; data?: unknown }>).forEach(
      stripOcrPagesFromItem,
    );
  }
}

import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { hasDuplicateName } from "@/lib/workspace/unique-name";
import { db, workspaceEvents } from "@/lib/db/client";
import { eq, gt, asc, sql, and } from "drizzle-orm";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { broadcastWorkspaceEventFromServer } from "@/lib/realtime/server-broadcast";
import { invalidateWorkspaceCache } from "@/app/api/mcp/route";

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

  const latestSnapshot = latestSnapshotData[0] as
    | {
        id?: string;
        snapshotVersion?: number;
        state?: any;
        eventCount?: number;
        createdAt?: string;
      }
    | undefined;
  const snapshotVersion =
    typeof latestSnapshot?.snapshotVersion === "number"
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
        gt(workspaceEvents.version, snapshotVersion),
      ),
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
      : snapshotVersion || 0;

  // Strip heavy OCR page payloads — client doesn't need them in event responses.
  if (latestSnapshot?.state)
    stripOcrPagesFromState(
      latestSnapshot.state as {
        items?: Array<{ type?: string; data?: unknown }>;
      },
    );
  events.forEach(stripPdfOcrFromEventPayload);

  const response: EventResponse = {
    events,
    version: maxVersion,
    snapshot:
      latestSnapshot && typeof latestSnapshot.snapshotVersion === "number"
        ? {
            version: latestSnapshot.snapshotVersion,
            state: latestSnapshot.state as any,
          }
        : undefined,
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
      const state = await loadWorkspaceState(id);
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
      const state = await loadWorkspaceState(id);
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
    return NextResponse.json(
      { error: "Failed to append event" },
      { status: 500 },
    );
  }

  // PostgreSQL returns result as string like "(6,t)" - need to parse it
  const rawResult = result[0].result as string;

  // Parse the PostgreSQL tuple format "(version,conflict)"
  const match = rawResult.match(/\((\d+),(t|f)\)/);
  if (!match) {
    console.error(
      `[POST /api/workspaces/${id}/events] Failed to parse PostgreSQL result:`,
      rawResult,
    );
    return NextResponse.json(
      { error: "Invalid database response" },
      { status: 500 },
    );
  }

  const appendResult = {
    version: parseInt(match[1], 10),
    conflict: match[2] === "t",
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
    events.forEach(stripPdfOcrFromEventPayload);

    const totalTime = Date.now() - startTime;
    timings.total = totalTime;

    return NextResponse.json({
      conflict: true,
      version: appendResult.version,
      currentEvents: events,
    });
  }

  // Success - no conflict
  // Invalidate MCP cache for this workspace
  invalidateWorkspaceCache(id);

  // Check if we need to create a snapshot (async, non-blocking)
  checkAndCreateSnapshot(id).catch((err) => {
    console.error(
      `[POST /api/workspaces/${id}/events] Failed to create snapshot:`,
      err,
    );
    // Don't fail the request if snapshot creation fails
  });

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
