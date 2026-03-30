import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceFolders } from "@/lib/workspace/state-loader";
import { requireAuth, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces/[id]/folders
 * Returns only folder items from the workspace state.
 * Lightweight alternative to GET /api/workspaces/[id] for clients (e.g. Chrome extension)
 * that only need folder data without the full workspace payload.
 */
async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = await requireAuth();

  await verifyWorkspaceAccess(id, userId, "viewer");

  const folders = await loadWorkspaceFolders(id);

  return NextResponse.json({ folders });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]/folders");
