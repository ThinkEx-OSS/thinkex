/**
 * Collaborators API - List and invite collaborators
 * 
 * GET /api/workspaces/[id]/collaborators - List collaborators
 * POST /api/workspaces/[id]/collaborators - Invite a new collaborator
 */

/**
 * Collaborators API - List and invite collaborators
 * 
 * GET /api/workspaces/[id]/collaborators - List collaborators
 * POST /api/workspaces/[id]/collaborators - Invite a new collaborator
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceCollaborators, workspaces, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
    verifyWorkspaceAccess,
    withErrorHandling,
    requireAuth,
    requireAuthWithUserInfo
} from "@/lib/api/workspace-helpers";
import { Resend } from "resend";
import { InviteEmailTemplate } from "@/components/email/invite-email";

const resend = new Resend(process.env.RESEND_API_KEY);

// GET /api/workspaces/[id]/collaborators
async function handleGET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const paramsPromise = params;
    const authPromise = requireAuth();

    const { id: workspaceId } = await paramsPromise;
    const userId = await authPromise;

    // Verify access (viewers can see collaborators)
    await verifyWorkspaceAccess(workspaceId, userId, "viewer");

    // Get owner details
    const [workspaceOwner] = await db
        .select({
            userId: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            createdAt: workspaces.createdAt,
        })
        .from(workspaces)
        .leftJoin(user, eq(workspaces.userId, user.id))
        .where(eq(workspaces.id, workspaceId));

    // Get collaborators with user info
    const collaborators = await db
        .select({
            id: workspaceCollaborators.id,
            userId: workspaceCollaborators.userId,
            permissionLevel: workspaceCollaborators.permissionLevel,
            createdAt: workspaceCollaborators.createdAt,
            name: user.name,
            email: user.email,
            image: user.image,
        })
        .from(workspaceCollaborators)
        .leftJoin(user, eq(workspaceCollaborators.userId, user.id))
        .where(eq(workspaceCollaborators.workspaceId, workspaceId));

    const ownerAsCollaborator = workspaceOwner ? {
        id: `owner-${workspaceOwner.userId}`,
        userId: workspaceOwner.userId,
        permissionLevel: "owner",
        createdAt: workspaceOwner.createdAt,
        name: workspaceOwner.name,
        email: workspaceOwner.email,
        image: workspaceOwner.image
    } : null;

    const allCollaborators = ownerAsCollaborator
        ? [ownerAsCollaborator, ...collaborators]
        : collaborators;

    return NextResponse.json({ collaborators: allCollaborators });
}

// POST /api/workspaces/[id]/collaborators
async function handlePOST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const paramsPromise = params;
    const authPromise = requireAuthWithUserInfo();

    const { id: workspaceId } = await paramsPromise;
    const currentUser = await authPromise;

    const body = await request.json();
    const { email, permissionLevel = "editor" } = body;

    if (!email || typeof email !== "string") {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Verify access (only editors/owners can invite)
    // Note: The original code allowed editors to invite. 
    // Usually only owners/admins invite, but respecting original logic:
    await verifyWorkspaceAccess(workspaceId, currentUser.userId, "editor");

    // Find the user by email
    const [invitedUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email.trim().toLowerCase()))
        .limit(1);

    if (!invitedUser) {
        return NextResponse.json(
            { message: "User not found. They need to sign up first." },
            { status: 404 }
        );
    }

    // Check if already a collaborator
    const [existing] = await db
        .select({ id: workspaceCollaborators.id })
        .from(workspaceCollaborators)
        .where(
            and(
                eq(workspaceCollaborators.workspaceId, workspaceId),
                eq(workspaceCollaborators.userId, invitedUser.id)
            )
        )
        .limit(1);

    if (existing) {
        return NextResponse.json(
            { message: "User is already a collaborator" },
            { status: 409 }
        );
    }

    // Can't invite yourself
    if (invitedUser.id === currentUser.userId) {
        return NextResponse.json(
            { message: "You can't invite yourself" },
            { status: 400 }
        );
    }

    // Get workspace to check if invitee is the owner
    const [ws] = await db
        .select({
            userId: workspaces.userId,
            name: workspaces.name
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

    if (ws && invitedUser.id === ws.userId) {
        return NextResponse.json(
            { message: "Cannot invite workspace owner as collaborator" },
            { status: 400 }
        );
    }

    // Add collaborator
    const [newCollaborator] = await db
        .insert(workspaceCollaborators)
        .values({
            workspaceId,
            userId: invitedUser.id,
            permissionLevel: permissionLevel === "viewer" ? "viewer" : "editor",
        })
        .returning();

    // Send invitation email
    try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thinkex.app';
        const workspaceUrl = `https://thinkex.app/workspace/${workspaceId}`;
        const { data, error } = await resend.emails.send({
            from: 'ThinkEx <hello@thinkex.app>', // Update this with your verified domain if available
            to: [email],
            subject: `You've been invited to collaborate on ${ws.name || 'a workspace'}`,
            react: InviteEmailTemplate({
                inviterName: currentUser.name || 'A user',
                workspaceName: ws.name || 'Workspace',
                workspaceUrl,
            }),
        });

        if (error) {
            console.error("Failed to send invitation email:", error);
        }
    } catch (emailError) {
        console.error("Error sending invitation email:", emailError);
    }

    return NextResponse.json({ collaborator: newCollaborator }, { status: 201 });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]/collaborators");
export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/collaborators");
