import { NextRequest, NextResponse } from "next/server";
import { db, workspaceEvents, workspaces } from "@/lib/db/client";
import { eq, and, ne, sql } from "drizzle-orm";
import { requireAuth, verifyWorkspaceOwnership, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";
import { generateSlug } from "@/lib/workspace/slug";
import { loadWorkspaceCurrentState } from "@/lib/workspace/workspace-items-projection";
import { EMPTY_WORKSPACE_ACTIVITY_SUMMARY } from "@/lib/workspace/workspace-activity";

/**
 * GET /api/workspaces/[id]
 * Get a specific workspace with its state
 * Supports owner and collaborators
 */
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  // Check access (owner or collaborator)
  const accessInfo = await verifyWorkspaceAccess(id, userId, 'viewer');

  // Get workspace data
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Current-state reads now prefer the item projection while workspace name stays canonical in workspaces.name.
  const [state, activityRow] = await Promise.all([
    loadWorkspaceCurrentState(id, userId),
    db
      .select({
        version: sql<number>`coalesce(max(${workspaceEvents.version}), 0)::int`,
        eventCount: sql<number>`count(*)::int`,
        lastEventAt: sql<number | null>`max(${workspaceEvents.timestamp})`,
      })
      .from(workspaceEvents)
      .where(eq(workspaceEvents.workspaceId, id))
      .limit(1),
  ]);

  const activity = activityRow[0]
    ? {
        version: Number(activityRow[0].version ?? 0),
        eventCount: Number(activityRow[0].eventCount ?? 0),
        lastEventAt:
          activityRow[0].lastEventAt == null
            ? null
            : Number(activityRow[0].lastEventAt),
      }
    : EMPTY_WORKSPACE_ACTIVITY_SUMMARY;

  return NextResponse.json({
    workspace: {
      ...workspace,
      state,
      activity,
      isShared: !accessInfo.isOwner,
      permissionLevel: accessInfo.permissionLevel,
    },
  });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]");

/**
 * PATCH /api/workspaces/[id]
 * Update workspace metadata (owner only)
 */
async function handlePATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();
  const bodyPromise = request.json();

  const { id } = await paramsPromise;
  const userId = await authPromise;
  const body = await bodyPromise;
  const { name, description, is_public, icon, color } = body;

  // Check ownership
  await verifyWorkspaceOwnership(id, userId);

  // Update workspace
  const updateData: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    icon?: string | null;
    color?: string | null;
    slug?: string;
  } = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (is_public !== undefined) updateData.isPublic = is_public;
  if (icon !== undefined) updateData.icon = icon;
  if (color !== undefined) updateData.color = color;

  // Only regenerate slug when the name actually changed (icon/color updates shouldn't change URL)
  let nameChanged = false;
  if (name !== undefined) {
    const [current] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    nameChanged = !!current && current.name !== name;
  }
  if (nameChanged) {
    let newSlug = generateSlug(name!);
    
    // Check for slug conflicts and resolve them
    let counter = 1;
    while (true) {
      const [existingWorkspace] = await db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.slug, newSlug),
            ne(workspaces.id, id)
          )
        )
        .limit(1);
      
      if (!existingWorkspace) break;
      
      // If conflict exists, append counter
      const baseSlug = generateSlug(name).replace(/-\d+$/, ''); // Remove existing counter if any
      newSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    updateData.slug = newSlug;
  }

  const [updatedWorkspace] = await db
    .update(workspaces)
    .set(updateData)
    .where(eq(workspaces.id, id))
    .returning();

  return NextResponse.json({ workspace: updatedWorkspace });
}

export const PATCH = withErrorHandling(handlePATCH, "PATCH /api/workspaces/[id]");

/**
 * DELETE /api/workspaces/[id]
 * Delete a workspace (owner only)
 */
async function handleDELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Start independent operations in parallel
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  // Check ownership
  await verifyWorkspaceOwnership(id, userId);

  // Delete workspace (cascade also removes any legacy snapshot rows still in the DB)
  await db
    .delete(workspaces)
    .where(eq(workspaces.id, id));

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandling(handleDELETE, "DELETE /api/workspaces/[id]");

