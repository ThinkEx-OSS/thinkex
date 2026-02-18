import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceShareLinks, workspaceCollaborators, workspaces } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { withErrorHandling } from "@/lib/api/workspace-helpers";
import { auth } from "@/lib/auth";

async function handlePOST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.isAnonymous) {
    return NextResponse.json(
      { error: "Sign in with an account to join this workspace" },
      { status: 403 }
    );
  }

  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const [shareLink] = await db
    .select()
    .from(workspaceShareLinks)
    .where(eq(workspaceShareLinks.token, token))
    .limit(1);

  if (!shareLink) {
    return NextResponse.json({ error: "Share link not found" }, { status: 404 });
  }

  if (new Date(shareLink.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Share link expired" }, { status: 410 });
  }

  const [existing] = await db
    .select()
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, shareLink.workspaceId),
        eq(workspaceCollaborators.userId, session.user.id)
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(workspaceCollaborators).values({
      workspaceId: shareLink.workspaceId,
      userId: session.user.id,
      permissionLevel: shareLink.permissionLevel,
    });
  }

  const [workspace] = await db
    .select({ slug: workspaces.slug, id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, shareLink.workspaceId))
    .limit(1);

  return NextResponse.json({
    success: true,
    workspaceId: workspace?.id,
    workspaceSlug: workspace?.slug,
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/share-link/claim");
