import { NextRequest, NextResponse } from "next/server";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { requireAuth, verifyWorkspaceOwnership, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

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

  // Get workspace state by replaying events
  const state = await loadWorkspaceState(id);

  // Ensure state has workspace metadata if empty
  if (!state.globalTitle && !state.globalDescription) {
    state.globalTitle = workspace.name || "";
    state.globalDescription = workspace.description || "";
  }

  return NextResponse.json({
    workspace: {
      ...workspace,
      state,
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

  // Delete workspace (cascade will delete events and snapshots)
  await db
    .delete(workspaces)
    .where(eq(workspaces.id, id));

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandling(handleDELETE, "DELETE /api/workspaces/[id]");

