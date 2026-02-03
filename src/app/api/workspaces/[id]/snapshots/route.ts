import { NextRequest, NextResponse } from "next/server";
import type { SnapshotInfo } from "@/lib/workspace/events";
import { db, workspaceSnapshots } from "@/lib/db/client";
import { eq, desc } from "drizzle-orm";
import { requireAuth, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces/[id]/snapshots
 * Fetch all snapshots for a workspace (for version history)
 * Note: Owner only (sharing is fork-based)
 */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  // Check if user has access (owner or collaborator)
  await verifyWorkspaceAccess(id, userId, 'viewer');

  // Get ALL snapshots for version history
  const allSnapshotsData = await db
    .select()
    .from(workspaceSnapshots)
    .where(eq(workspaceSnapshots.workspaceId, id))
    .orderBy(desc(workspaceSnapshots.snapshotVersion));

  const snapshots: SnapshotInfo[] = allSnapshotsData.map(s => ({
    id: s.id,
    version: s.snapshotVersion,
    eventCount: s.eventCount,
    createdAt: s.createdAt || '',
    // Include state for restoration
    state: s.state as any,
  }));

  return NextResponse.json({ snapshots });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]/snapshots");
