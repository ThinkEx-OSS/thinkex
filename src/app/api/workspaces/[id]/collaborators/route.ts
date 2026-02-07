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
import { workspaceCollaborators, workspaces, user, workspaceInvites } from "@/lib/db/schema";
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

    // Get pending invites
    const invites = await db
        .select({
            id: workspaceInvites.id,
            email: workspaceInvites.email,
            permissionLevel: workspaceInvites.permissionLevel,
            createdAt: workspaceInvites.createdAt,
            expiresAt: workspaceInvites.expiresAt,
            inviterId: workspaceInvites.inviterId,
        })
        .from(workspaceInvites)
        .where(eq(workspaceInvites.workspaceId, workspaceId));

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

    return NextResponse.json({ collaborators: allCollaborators, invites });
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

    // If user not found, we will create a pending invite later in the code
    // The previous 404 block here was preventing that flow

    // Check if already a collaborator
    const [existing] = await db
        .select({ id: workspaceCollaborators.id })
        .from(workspaceCollaborators)
        .where(
            and(
                eq(workspaceCollaborators.workspaceId, workspaceId),
                eq(workspaceCollaborators.userId, invitedUser?.id || "non-existent") // non-existent won't match
            )
        )
        .limit(1);

    if (existing) {
        return NextResponse.json(
            { message: "User is already a collaborator" },
            { status: 409 }
        );
    }

    // Get workspace details for email and token generation
    const [ws] = await db
        .select({
            userId: workspaces.userId,
            name: workspaces.name,
            slug: workspaces.slug
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

    // If user exists, add as collaborator directly
    if (invitedUser) {
        // Can't invite yourself
        if (invitedUser.id === currentUser.userId) {
            return NextResponse.json(
                { message: "You can't invite yourself" },
                { status: 400 }
            );
        }

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

        // Send standard invitation email
        try {
            // Use slug if available, otherwise fallback to id
            const identifier = ws.slug || workspaceId;
            const workspaceUrl = `https://thinkex.app/workspace/${identifier}`;
            const { data, error } = await resend.emails.send({
                from: 'ThinkEx <hello@thinkex.app>',
                to: [email],
                subject: `You've been invited to collaborate on ${ws.name || 'a workspace'}`,
                react: InviteEmailTemplate({
                    inviterName: currentUser.name || 'A user',
                    workspaceName: ws.name || 'Workspace',
                    workspaceUrl,
                    permissionLevel,
                }),

            });
            if (error) console.error("Failed to send invitation email:", error);
        } catch (emailError) {
            console.error("Error sending invitation email:", emailError);
        }

        return NextResponse.json({ collaborator: newCollaborator }, { status: 201 });
    }

    // User does NOT exist - Create Pending Invite

    // Import nanoid dynamically or use a simple random string generator since nanoid might be ESM only
    // Simple secure random token generator
    const generateToken = () => {
        // Use Web Crypto API which is available in Node.js global scope in newer versions
        // or fall back to Math.random for older environments if critical
        if (typeof crypto !== 'undefined') {
            const array = new Uint8Array(24);
            crypto.getRandomValues(array);
            return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
        } else {
            // Fallback for environments without crypto global
            return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }
    };

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry


    // Implementation for Pending Invite
    // 1. Delete existing invite to replace it
    await db
        .delete(workspaceInvites)
        .where(
            and(
                eq(workspaceInvites.workspaceId, workspaceId),
                eq(workspaceInvites.email, email.trim().toLowerCase())
            )
        );

    // 2. Create new invite
    await db.insert(workspaceInvites).values({
        workspaceId,
        email: email.trim().toLowerCase(),
        token,
        inviterId: currentUser.userId,
        permissionLevel: permissionLevel === "viewer" ? "viewer" : "editor",
        expiresAt: expiresAt.toISOString(),
    });

    // 3. Send Invite Email
    try {
        const identifier = ws.slug || workspaceId;
        // Append ?invite=token to the URL
        const workspaceUrl = `https://thinkex.app/workspace/${identifier}?invite=${token}`;

        await resend.emails.send({
            from: 'ThinkEx <hello@thinkex.app>',
            to: [email],
            subject: `You've been invited to collaborate on ${ws.name || 'a workspace'}`,
            react: InviteEmailTemplate({
                inviterName: currentUser.name || 'A user',
                workspaceName: ws.name || 'Workspace',
                workspaceUrl,
            }),
        });
    } catch (emailError) {
        console.error("Error sending pending invitation email:", emailError);
        // We still return success as the invite was created
    }

    return NextResponse.json(
        {
            message: "Invitation sent to new user",
            pending: true,
            email
        },
        { status: 201 }
    );
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces/[id]/collaborators");
export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/collaborators");
