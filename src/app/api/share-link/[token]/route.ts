import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceShareLinks, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withErrorHandling } from "@/lib/api/workspace-helpers";

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const [shareLink] = await db
    .select({
      workspaceId: workspaceShareLinks.workspaceId,
      expiresAt: workspaceShareLinks.expiresAt,
    })
    .from(workspaceShareLinks)
    .where(eq(workspaceShareLinks.token, token))
    .limit(1);

  if (!shareLink) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  if (new Date(shareLink.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Share link expired" }, { status: 410 });
  }

  const [workspace] = await db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, shareLink.workspaceId))
    .limit(1);

  return NextResponse.json({
    workspaceId: shareLink.workspaceId,
    workspaceName: workspace?.name || "Workspace",
  });
}

export const GET = withErrorHandling(handleGET, "GET /api/share-link/[token]");
