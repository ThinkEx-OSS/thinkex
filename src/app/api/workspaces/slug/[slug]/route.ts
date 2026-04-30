import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces/slug/[slug]
 *
 * Resolves a workspace by slug and returns its metadata
 * (id, name, slug, icon, color, isShared, permissionLevel). Used by
 * `WorkspaceContext` to map URL slug → workspace id so Zero can subscribe
 * to items. Item state itself is sync'd by Zero, not returned here.
 */
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { slug } = await paramsPromise;
  const userId = await authPromise;

  // Get workspace by slug - first check ownership
  const [ownedWorkspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.slug, slug), eq(workspaces.userId, userId)))
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
      const candidateIds = candidateWorkspaces.map((w) => w.id);

      const [validCollab] = await db
        .select({
          permissionLevel: workspaceCollaborators.permissionLevel,
          workspaceId: workspaceCollaborators.workspaceId,
        })
        .from(workspaceCollaborators)
        .where(
          and(
            inArray(workspaceCollaborators.workspaceId, candidateIds),
            eq(workspaceCollaborators.userId, userId),
          ),
        )
        .limit(1);

      if (validCollab) {
        // Found the specific workspace instance this user has access to
        const foundWorkspace = candidateWorkspaces.find(
          (w) => w.id === validCollab.workspaceId,
        );
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

  return NextResponse.json({
    workspace: {
      ...workspace,
      isShared,
      permissionLevel,
    },
  });
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/slug/[slug]",
);
