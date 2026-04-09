import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { loadWorkspaceStatePayload } from "@/lib/workspace/state-loader";

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const paramsPromise = params;
  const authPromise = requireAuth();

  const { id } = await paramsPromise;
  const userId = await authPromise;

  await verifyWorkspaceAccess(id, userId, "viewer");

  const statePayload = await loadWorkspaceStatePayload(id, { userId });
  return NextResponse.json(statePayload);
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/[id]/state",
);
