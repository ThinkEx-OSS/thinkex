import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";

/**
 * GET /api/workspaces/slug/[slug]
 * Get a workspace by slug (more user-friendly than UUID)
 * Note: Owner only (sharing is fork-based)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get workspace by slug for this user (ownership only)
    const workspace = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.slug, slug),
          eq(workspaces.userId, userId)
        )
      )
      .limit(1);

    if (!workspace[0]) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get workspace state by replaying events
    const state = await loadWorkspaceState(workspace[0].id);

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
    console.error("Error in GET /api/workspaces/slug/[slug]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

