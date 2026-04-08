import { NextRequest, NextResponse } from "next/server";
import { db, workspaceEvents } from "@/lib/db/client";
import { eq, gt, and } from "drizzle-orm";
import { requireAuth, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";
import { backfillWorkspaceItemsProjection } from "@/lib/workspace/workspace-items-projection";

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

  const result = await db.transaction(async (tx) => {
    const deletedEvents = await tx
      .delete(workspaceEvents)
      .where(
        and(
          eq(workspaceEvents.workspaceId, id),
          gt(workspaceEvents.version, targetVersion)
        )
      )
      .returning({ version: workspaceEvents.version });

    return deletedEvents;
  });

  await backfillWorkspaceItemsProjection(id);

  return NextResponse.json({
    success: true,
    deletedCount: result.length,
    newVersion: targetVersion,
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/events/undo");
