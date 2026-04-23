import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";
import { db } from "@/lib/db/client";
import {
  user,
  workspaceCollaborators,
  workspaceShareLinks,
  workspaces,
} from "@/lib/db/schema";

async function handlePOST(request: NextRequest) {
  const userId = await requireAuth();
  const [currentUser] = await db
    .select({ isAnonymous: user.isAnonymous })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (currentUser?.isAnonymous) {
    return NextResponse.json(
      { error: "Sign in with an account to join this workspace" },
      { status: 403 },
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
    return NextResponse.json(
      { error: "Share link not found" },
      { status: 404 },
    );
  }

  if (new Date(shareLink.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Share link expired" }, { status: 410 });
  }

  const [workspace] = await db
    .select({
      slug: workspaces.slug,
      id: workspaces.id,
      ownerId: workspaces.userId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, shareLink.workspaceId))
    .limit(1);

  if (workspace && workspace.ownerId !== userId) {
    const [existing] = await db
      .select()
      .from(workspaceCollaborators)
      .where(
        and(
          eq(workspaceCollaborators.workspaceId, shareLink.workspaceId),
          eq(workspaceCollaborators.userId, userId),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(workspaceCollaborators).values({
        workspaceId: shareLink.workspaceId,
        userId,
        permissionLevel: shareLink.permissionLevel,
      });
      await db
        .update(workspaceShareLinks)
        .set({ claimCount: sql`${workspaceShareLinks.claimCount} + 1` })
        .where(eq(workspaceShareLinks.id, shareLink.id));
    }
  }

  return NextResponse.json({
    success: true,
    workspaceId: workspace?.id,
    workspaceSlug: workspace?.slug,
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/share-link/claim");
