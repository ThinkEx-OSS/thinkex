import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";

/**
 * GET /api/share/[id]
 * Public endpoint to get workspace data for sharing/forking
 * No authentication required - this is a public share link
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get workspace metadata
    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!workspace[0]) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get workspace state by replaying events
    const state = await loadWorkspaceState(id);

    // Ensure state has workspace metadata if empty
    if (!state.globalTitle && !state.globalDescription) {
      state.globalTitle = workspace[0].name || "";
      state.globalDescription = workspace[0].description || "";
    }

    // Return workspace data for forking (public access)
    return NextResponse.json({
      workspace: {
        id: workspace[0].id,
        name: workspace[0].name,
        description: workspace[0].description || "",
        icon: workspace[0].icon,
        color: workspace[0].color,
        state: state,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/share/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

