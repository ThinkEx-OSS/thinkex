import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * POST /api/workspaces/reorder
 * Update the sort_order for multiple workspaces
 */
async function handlePOST(request: NextRequest) {
  const userId = await requireAuth();

    const body = await request.json();
    const { workspaceIds } = body;

    if (!Array.isArray(workspaceIds)) {
      return NextResponse.json({ error: "workspaceIds must be an array" }, { status: 400 });
    }

    if (workspaceIds.length === 0) {
      return NextResponse.json({ error: "workspaceIds array cannot be empty" }, { status: 400 });
    }

    // Verify all workspaces belong to the user
    const userWorkspaces = await db
      .select({ id: workspaces.id, userId: workspaces.userId, sortOrder: workspaces.sortOrder })
      .from(workspaces)
      .where(inArray(workspaces.id, workspaceIds));

    // Check that all workspaces exist and belong to the user
    if (userWorkspaces.length !== workspaceIds.length) {
      return NextResponse.json({ error: "Some workspaces not found" }, { status: 404 });
    }

    const allOwned = userWorkspaces.every((w) => w.userId === userId);
    if (!allOwned) {
      return NextResponse.json({ error: "Access denied: Only owned workspaces can be reordered" }, { status: 403 });
    }

    // Update sort_order for each workspace
    for (let index = 0; index < workspaceIds.length; index++) {
      const workspaceId = workspaceIds[index];
      
      await db
        .update(workspaces)
        .set({ sortOrder: index })
        .where(
          and(
            eq(workspaces.id, workspaceId),
            eq(workspaces.userId, userId) // Extra safety check
          )
        );
    }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/reorder");
