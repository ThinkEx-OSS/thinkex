import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and, or, inArray } from "drizzle-orm";
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

  // If not owned, check if user is a collaborator on ANY workspace with this slug
  // Legacy workspaces might have non-unique slugs (e.g. "my-workspace" created by multiple users)
  if (!workspace) {
    // Find all workspaces with this slug
    const candidateWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, slug));

    if (candidateWorkspaces.length > 0) {
      // Check if user is a collaborator on any of these workspaces
      // We can do this efficiently by querying for valid collaborations
      const candidateIds = candidateWorkspaces.map(w => w.id);

      const [validCollab] = await db
        .select({
          permissionLevel: workspaceCollaborators.permissionLevel,
          workspaceId: workspaceCollaborators.workspaceId
        })
        .from(workspaceCollaborators)
        .where(
          and(
            inArray(workspaceCollaborators.workspaceId, candidateIds),
            eq(workspaceCollaborators.userId, userId)
          )
        )
        .limit(1);

      if (validCollab) {
        // Found the specific workspace instance this user has access to
        const foundWorkspace = candidateWorkspaces.find(w => w.id === validCollab.workspaceId);
        if (foundWorkspace) {
          workspace = foundWorkspace;
          isShared = true;
          permissionLevel = validCollab.permissionLevel;
        }
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
  if (!state.globalTitle) {
    state.globalTitle = workspace.name || "";
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

