import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { SnapshotInfo } from "@/lib/workspace/events";
import { db, workspaces, workspaceSnapshots } from "@/lib/db/client";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/workspaces/[id]/snapshots
 * Fetch all snapshots for a workspace (for version history)
 * Note: Owner only (sharing is fork-based)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if user is workspace owner
    const workspace = await db
      .select({ userId: workspaces.userId })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!workspace[0]) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Enforce strict ownership (sharing is fork-based)
    if (workspace[0].userId !== userId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

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
  } catch (error) {
    console.error("Error in GET /api/workspaces/[id]/snapshots:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

