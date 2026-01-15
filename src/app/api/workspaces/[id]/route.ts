import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";

/**
 * GET /api/workspaces/[id]
 * Get a specific workspace with its state
 * Note: Only owners can access (sharing is fork-based - users import copies)
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

    // Allow anonymous users
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get workspace
    const workspace = await db
      .select()
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

    // Get workspace state by replaying events
    const state = await loadWorkspaceState(id);

    // Ensure state has workspace metadata if empty
    if (!state.globalTitle && !state.globalDescription) {
      state.globalTitle = workspace[0].name || "";
      state.globalDescription = workspace[0].description || "";
    }

    return NextResponse.json({
      workspace: {
        ...workspace[0],
        state,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/workspaces/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/workspaces/[id]
 * Update workspace metadata (owner only)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // Allow anonymous users
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json();
    const { name, description, is_public, icon, color } = body;

    // Check ownership
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

    // Update workspace
    const updateData: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      icon?: string | null;
      color?: string | null;
    } = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (is_public !== undefined) updateData.isPublic = is_public;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;

    const [updatedWorkspace] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, id))
      .returning();

    return NextResponse.json({ workspace: updatedWorkspace });
  } catch (error) {
    console.error("Error in PATCH /api/workspaces/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/workspaces/[id]
 * Delete a workspace (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // Allow anonymous users
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check ownership
    const workspace = await db
      .select({ userId: workspaces.userId })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!workspace[0]) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if (workspace[0].userId !== userId) {
      return NextResponse.json({ error: "Only owners can delete workspaces" }, { status: 403 });
    }

    // Delete workspace (cascade will delete events and snapshots)
    await db
      .delete(workspaces)
      .where(eq(workspaces.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/workspaces/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

