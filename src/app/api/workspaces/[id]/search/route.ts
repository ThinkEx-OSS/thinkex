import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { db, workspaceItemContent } from "@/lib/db/client";
import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireAuth();
  const { id } = await params;

  await verifyWorkspaceAccess(id, userId, "viewer");

  const body = await request.json();
  const query =
    typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ itemIds: [] });

  const [queryEmbedding, rows] = await Promise.all([
    embedText(query),
    db
      .select({
        itemId: workspaceItemContent.itemId,
        embedData: workspaceItemContent.embedData,
      })
      .from(workspaceItemContent)
      .where(eq(workspaceItemContent.workspaceId, id)),
  ]);

  const itemIds = rows
    .filter((r) => Array.isArray((r.embedData as { vector?: number[] })?.vector))
    .map((r) => ({
      itemId: r.itemId,
      score: cosineSimilarity(
        queryEmbedding,
        (r.embedData as { vector: number[] }).vector,
      ),
    }))
    .filter((r) => r.score > 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.itemId);

  return NextResponse.json({ itemIds });
}

export const POST = withErrorHandling(
  handlePOST,
  "POST /api/workspaces/[id]/search",
);
