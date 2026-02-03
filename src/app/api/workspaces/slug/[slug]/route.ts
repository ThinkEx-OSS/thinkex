import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces/slug/[slug]
 * Get a workspace by slug (more user-friendly than UUID)
 * Supports owner and collaborators
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

  // Get workspace by slug - first check ownership
  const [ownedWorkspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.slug, slug),
        eq(workspaces.userId, userId)
      )
    )
    .limit(1);

  let workspace = ownedWorkspace;
  let isShared = false;
  let permissionLevel: string | null = null;

  // If not owned, check if user is a collaborator
  if (!workspace) {
    // First find the workspace by slug
    const [anyWorkspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, slug))
      .limit(1);

    if (anyWorkspace) {
      // Check if user is a collaborator on this workspace
      const [collab] = await db
        .select({ permissionLevel: workspaceCollaborators.permissionLevel })
        .from(workspaceCollaborators)
        .where(
          and(
            eq(workspaceCollaborators.workspaceId, anyWorkspace.id),
            eq(workspaceCollaborators.userId, userId)
          )
        )
        .limit(1);

      if (collab) {
        workspace = anyWorkspace;
        isShared = true;
        permissionLevel = collab.permissionLevel;
      }
    }
  }

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // For metadata-only requests, return just the workspace record (no state loading)
  // This is much faster and used for initial workspace identification
  if (metadataOnly) {
    return NextResponse.json({
      workspace: {
        ...workspace,
        isShared,
        permissionLevel,
      },
    });
  }

  // Get workspace state by replaying events (full mode)
  const state = await loadWorkspaceState(workspace.id);

  // Ensure state has workspace metadata if empty
  if (!state.globalTitle && !state.globalDescription) {
    state.globalTitle = workspace.name || "";
    state.globalDescription = workspace.description || "";
  }

  return NextResponse.json({
    workspace: {
      ...workspace,
      state,
      isShared,
      permissionLevel,
    },
  });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/slug/[slug]");

