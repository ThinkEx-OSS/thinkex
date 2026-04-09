import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { loadWorkspaceStateSnapshot } from "@/lib/workspace/state-loader";

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  await verifyWorkspaceAccess(id, userId, "viewer");

  const snapshot = await loadWorkspaceStateSnapshot(id, { userId });
  return NextResponse.json(snapshot);
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/[id]/state",
);
