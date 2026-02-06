
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaces, user } from "@/lib/db/schema";
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

    // Find the invite
    const [invite] = await db
        .select({
            email: workspaceInvites.email,
            expiresAt: workspaceInvites.expiresAt,
            workspaceId: workspaceInvites.workspaceId,
            inviterId: workspaceInvites.inviterId,
        })
        .from(workspaceInvites)
        .where(eq(workspaceInvites.token, token))
        .limit(1);

    if (!invite) {
        return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    // Check expiration
    if (new Date(invite.expiresAt) < new Date()) {
        return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    // Get workspace details
    const [workspace] = await db
        .select({
            name: workspaces.name,
        })
        .from(workspaces)
        .where(eq(workspaces.id, invite.workspaceId))
        .limit(1);

    // Get inviter details
    const [inviter] = await db
        .select({
            name: user.name,
            email: user.email,
            image: user.image
        })
        .from(user)
        .where(eq(user.id, invite.inviterId))
        .limit(1);

    return NextResponse.json({
        email: invite.email,
        workspaceName: workspace?.name || "Workspace",
        inviterName: inviter?.name || inviter?.email || "Someone",
        inviterImage: inviter?.image
    });
}

export const GET = withErrorHandling(handleGET, "GET /api/invites/[token]");
