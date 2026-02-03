import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuthWithUserInfo, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

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
  // Get user info
  const user = await requireAuthWithUserInfo();

  const { id } = await paramsPromise;
  const userId = user.userId;

  // Check access (owner or collaborator)
  // We need to know IF they are owner to decide which table to update
  const { isOwner } = await verifyWorkspaceAccess(id, userId, 'viewer');

  const now = new Date().toISOString();
  let lastOpenedAt = now;

  if (isOwner) {
    // Update owner's lastOpenedAt on the workspace itself
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set({ lastOpenedAt: now })
      .where(eq(workspaces.id, id))
      .returning();

    if (!updatedWorkspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    lastOpenedAt = updatedWorkspace.lastOpenedAt || now;
  } else {
    // Update collaborator's lastOpenedAt on the junction table
    const [updatedCollaborator] = await db
      .update(workspaceCollaborators)
      .set({ lastOpenedAt: now })
      .where(
        and(
          eq(workspaceCollaborators.workspaceId, id),
          eq(workspaceCollaborators.userId, userId)
        )
      )
      .returning();

    if (!updatedCollaborator) {
      // Should not happen if verifyWorkspaceAccess passed, but good safeguard
      return NextResponse.json({ error: "Collaborator record not found" }, { status: 404 });
    }
    lastOpenedAt = updatedCollaborator.lastOpenedAt || now;
  }

  return NextResponse.json({
    success: true,
    lastOpenedAt
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/track-open");
