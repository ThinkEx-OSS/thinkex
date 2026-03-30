import { NextRequest, NextResponse } from "next/server";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
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

  const state = await loadWorkspaceState(id);
  const folders = state.items.filter((item) => item.type === "folder");

  return NextResponse.json({ folders });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]/folders");
