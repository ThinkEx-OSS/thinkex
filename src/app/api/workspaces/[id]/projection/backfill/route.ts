import { NextResponse } from "next/server";
import {
  requireAuth,
  verifyWorkspaceOwnership,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import {
  backfillWorkspaceItemsProjection,
  reconcileWorkspaceItemsProjection,
} from "@/lib/workspace/workspace-items-projection";

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, userId] = await Promise.all([params, requireAuth()]);
  await verifyWorkspaceOwnership(id, userId);

  const backfill = await backfillWorkspaceItemsProjection(id);
  const reconciliation = await reconcileWorkspaceItemsProjection(id);

  return NextResponse.json({
    success: true,
    backfill,
    reconciliation,
  });
}

export const POST = withErrorHandling(
  handlePOST,
  "POST /api/workspaces/[id]/projection/backfill",
);
