import { NextRequest, NextResponse } from "next/server";
import { db, workspaceEvents } from "@/lib/db/client";
import { eq, gt, and } from "drizzle-orm";
import { requireAuth, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * POST /api/workspaces/[id]/events/undo
 * Delete all events after a given version, effectively reverting to that point.
 * Body: { targetVersion: number }
 */
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const paramsPromise = params;
  const authPromise = requireAuth();
  const bodyPromise = request.json();

  const { id } = await paramsPromise;
  const userId = await authPromise;
  const { targetVersion } = await bodyPromise;

  if (typeof targetVersion !== "number" || targetVersion < 0) {
    return NextResponse.json(
      { error: "targetVersion must be a non-negative number" },
      { status: 400 }
    );
  }

  await verifyWorkspaceAccess(id, userId, "editor");

  // Don't allow reverting past version 1 (WORKSPACE_CREATED)
  if (targetVersion < 1) {
    return NextResponse.json(
      { error: "Cannot revert past the initial workspace creation" },
      { status: 400 }
    );
  }

  const result = await db
    .delete(workspaceEvents)
    .where(
      and(
        eq(workspaceEvents.workspaceId, id),
        gt(workspaceEvents.version, targetVersion)
      )
    )
    .returning({ version: workspaceEvents.version });

  return NextResponse.json({
    success: true,
    deletedCount: result.length,
    newVersion: targetVersion,
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/events/undo");
