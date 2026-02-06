
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaceCollaborators, workspaces } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { withErrorHandling, requireAuth } from "@/lib/api/workspace-helpers";
import { auth } from "@/lib/auth"; // Need to get full session to check email

async function handlePOST(request: NextRequest) {
    // We need the email from the session, simpler requireAuth only returns userId.
    // So we use auth.api.getSession directly
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token) {
        return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Find the invite
    const [invite] = await db
        .select()
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

    // Verify email matches current user
    if (!session.user.email || invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
        return NextResponse.json({
            error: "Email mismatch",
            message: `This invite is for ${invite.email}, but you are logged in as ${session.user.email}. Please log out and sign up/in with the invited email.`
        }, { status: 403 });
    }

    // Check if already a collaborator - if so, just consume the invite
    const [existing] = await db
        .select()
        .from(workspaceCollaborators)
        .where(and(
            eq(workspaceCollaborators.workspaceId, invite.workspaceId),
            eq(workspaceCollaborators.userId, session.user.id)
        ))
        .limit(1);

    if (!existing) {
        // Add to collaborators
        await db.insert(workspaceCollaborators).values({
            workspaceId: invite.workspaceId,
            userId: session.user.id,
            permissionLevel: invite.permissionLevel,
        });
    }

    // Clean up used invite
    await db
        .delete(workspaceInvites)
        .where(eq(workspaceInvites.id, invite.id));

    // Get workspace slug for redirection
    const [workspace] = await db
        .select({ slug: workspaces.slug, id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, invite.workspaceId))
        .limit(1);

    return NextResponse.json({
        success: true,
        workspaceId: workspace?.id,
        workspaceSlug: workspace?.slug
    });
}

export const POST = withErrorHandling(handlePOST, "POST /api/invites/claim");
