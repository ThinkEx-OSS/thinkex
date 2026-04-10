import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { db, workspaceItemExtracted } from "@/lib/db/client";
import type { AudioSegment } from "@/lib/workspace-state/types";

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const userId = await requireAuth();

  await verifyWorkspaceAccess(id, userId, "viewer");

  const [row] = await db
    .select({
      transcriptSegments: workspaceItemExtracted.transcriptSegments,
      transcriptText: workspaceItemExtracted.transcriptText,
    })
    .from(workspaceItemExtracted)
    .where(
      and(
        eq(workspaceItemExtracted.workspaceId, id),
        eq(workspaceItemExtracted.itemId, itemId),
      ),
    )
    .limit(1);

  return NextResponse.json({
    segments: Array.isArray(row?.transcriptSegments)
      ? (row.transcriptSegments as AudioSegment[])
      : [],
    transcript: row?.transcriptText ?? null,
  });
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/[id]/items/[itemId]/transcript",
);
