import { NextRequest, NextResponse } from "next/server";
import {
  checkNeedsSnapshot,
  createSnapshot,
  checkAndCreateSnapshot
} from "@/lib/workspace/snapshot-manager";
import { db, workspaces } from "@/lib/db/client";
import { eq, sql } from "drizzle-orm";
import { requireAuth, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces/[id]/snapshot
 * Check snapshot status for a workspace (owner only)
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
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(id, userId, 'viewer');

  // Check snapshot status using utility functions
  const snapshotStatus = await checkNeedsSnapshot(id);

  // Get latest snapshot info
  const latestSnapshot = await db.execute(sql`
      SELECT * FROM get_latest_snapshot(${id}::uuid)
    `);

  return NextResponse.json({
    workspace: {
      id,
      title: workspace.name,
    },
    snapshot: latestSnapshot[0] || null,
    status: snapshotStatus,
  });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]/snapshot");

/**
 * POST /api/workspaces/[id]/snapshot
 * Manually create a snapshot for a workspace (owner only)
 */
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  // Check if user has editor access (owner or editor collaborator)
  await verifyWorkspaceAccess(id, userId, 'editor');

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
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/snapshot");

/**
 * PUT /api/workspaces/[id]/snapshot
 * Check and create snapshot if needed (owner only)
 */
async function handlePUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  // Check if user has editor access (owner or editor collaborator)
  await verifyWorkspaceAccess(id, userId, 'editor');

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
}

export const PUT = withErrorHandling(handlePUT, "PUT /api/workspaces/[id]/snapshot");
