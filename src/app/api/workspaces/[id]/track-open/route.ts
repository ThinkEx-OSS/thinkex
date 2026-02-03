import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { requireAuth, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * POST /api/workspaces/[id]/track-open
 * Update the lastOpenedAt timestamp for a workspace
 * Note: Only owners can track opens
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

  // Check access (owner or collaborator)
  await verifyWorkspaceAccess(id, userId, 'viewer');

  // Update lastOpenedAt to current timestamp
  const [updatedWorkspace] = await db
    .update(workspaces)
    .set({ lastOpenedAt: new Date().toISOString() })
    .where(eq(workspaces.id, id))
    .returning();

  // Guard against empty update result (workspace deleted between ownership check and update)
  if (!updatedWorkspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    lastOpenedAt: updatedWorkspace.lastOpenedAt
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/track-open");
