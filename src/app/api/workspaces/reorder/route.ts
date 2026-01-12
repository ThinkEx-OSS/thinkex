import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { eq, inArray, and } from "drizzle-orm";

/**
 * POST /api/workspaces/reorder
 * Update the sort_order for multiple workspaces
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const userId = session.user.id;

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
  } catch (error) {
    console.error("Error in POST /api/workspaces/reorder:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

