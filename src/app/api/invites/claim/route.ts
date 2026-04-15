import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  withErrorHandling,
  requireAuthWithUserInfo,
} from "@/lib/api/workspace-helpers";
import { db } from "@/lib/db/client";
import {
  workspaceCollaborators,
  workspaceInvites,
  workspaces,
} from "@/lib/db/schema";

async function handlePOST(request: NextRequest) {
  const currentUser = await requireAuthWithUserInfo();
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  if (
    !currentUser.email ||
    invite.email.toLowerCase() !== currentUser.email.toLowerCase()
  ) {
    return NextResponse.json(
      {
        error: "Email mismatch",
        message: `This invite is for ${invite.email}, but you are logged in as ${currentUser.email}. Please log out and sign up/in with the invited email.`,
      },
      { status: 403 },
    );
  }

  const [existing] = await db
    .select()
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, invite.workspaceId),
        eq(workspaceCollaborators.userId, currentUser.userId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(workspaceCollaborators).values({
      workspaceId: invite.workspaceId,
      userId: currentUser.userId,
      permissionLevel: invite.permissionLevel,
    });
  }

  await db.delete(workspaceInvites).where(eq(workspaceInvites.id, invite.id));

  const [workspace] = await db
    .select({ slug: workspaces.slug, id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, invite.workspaceId))
    .limit(1);

  return NextResponse.json({
    success: true,
    workspaceId: workspace?.id,
    workspaceSlug: workspace?.slug,
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/invites/claim");
