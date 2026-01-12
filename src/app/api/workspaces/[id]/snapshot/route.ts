import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  checkNeedsSnapshot,
  createSnapshot,
  checkAndCreateSnapshot
} from "@/lib/workspace/snapshot-manager";
import { db, workspaces } from "@/lib/db/client";
import { eq, sql } from "drizzle-orm";

/**
 * GET /api/workspaces/[id]/snapshot
 * Check snapshot status for a workspace (owner only)
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
      .select({ userId: workspaces.userId, name: workspaces.name })
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

    // Check snapshot status using utility functions
    const snapshotStatus = await checkNeedsSnapshot(id);

    // Get latest snapshot info
    const latestSnapshot = await db.execute(sql`
      SELECT * FROM get_latest_snapshot(${id}::uuid)
    `);

    return NextResponse.json({
      workspace: {
        id,
        title: workspace[0].name,
      },
      snapshot: latestSnapshot[0] || null,
      status: snapshotStatus,
    });
  } catch (error) {
    console.error("Error in GET /api/workspaces/[id]/snapshot:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/workspaces/[id]/snapshot
 * Manually create a snapshot for a workspace (owner only)
 */
export async function POST(
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

    if (workspace[0].userId !== userId) {
      return NextResponse.json(
        { error: "Only workspace owner can create snapshots" },
        { status: 403 }
      );
    }

    // Create snapshot using utility function
    const result = await createSnapshot(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to create snapshot" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      version: result.version,
      message: `Snapshot created at version ${result.version}`,
    });
  } catch (error) {
    console.error("Error in POST /api/workspaces/[id]/snapshot:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/workspaces/[id]/snapshot
 * Check and create snapshot if needed (owner only)
 */
export async function PUT(
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

    if (workspace[0].userId !== userId) {
      return NextResponse.json(
        { error: "Only workspace owner can manage snapshots" },
        { status: 403 }
      );
    }

    // Check and create snapshot if needed
    const statusBefore = await checkNeedsSnapshot(id);

    if (!statusBefore.needsSnapshot) {
      return NextResponse.json({
        message: "Snapshot not needed yet",
        status: statusBefore,
      });
    }

    // Create snapshot if needed
    await checkAndCreateSnapshot(id);

    const statusAfter = await checkNeedsSnapshot(id);

    return NextResponse.json({
      message: "Snapshot check complete",
      created: true,
      before: statusBefore,
      after: statusAfter,
    });
  } catch (error) {
    console.error("Error in PUT /api/workspaces/[id]/snapshot:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
