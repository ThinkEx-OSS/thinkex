import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces/slug/[slug]
 * Get a workspace by slug (more user-friendly than UUID)
 * Note: Owner only (sharing is fork-based)
 * 
 * Query params:
 * - metadata=true: Return only workspace metadata (faster, for initial load)
 */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();
  
  const { slug } = await paramsPromise;
  const userId = await authPromise;

  // Check if metadata-only mode is requested (faster path for initial workspace load)
  const metadataOnly = request.nextUrl.searchParams.get('metadata') === 'true';

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

  // For metadata-only requests, return just the workspace record (no state loading)
  // This is much faster and used for initial workspace identification
  if (metadataOnly) {
    return NextResponse.json({
      workspace: workspace[0],
    });
  }

  // Get workspace state by replaying events (full mode)
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
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/slug/[slug]");

