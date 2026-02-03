/**
 * Collaborators API - List and invite collaborators
 * 
 * GET /api/workspaces/[id]/collaborators - List collaborators
 * POST /api/workspaces/[id]/collaborators - Invite a new collaborator
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { workspaceCollaborators, workspaces, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId } = await params;

        // Verify access (viewers can see collaborators)
        try {
            await verifyWorkspaceAccess(workspaceId, session.user.id, "viewer");
        } catch (error) {
            if (error instanceof Response) return error;
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }


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
    } catch (error) {
        console.error("Error fetching collaborators:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId } = await params;
        const body = await request.json();
        const { email, permissionLevel = "editor" } = body;

        if (!email || typeof email !== "string") {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        // Verify access (only editors/owners can invite)
        try {
            await verifyWorkspaceAccess(workspaceId, session.user.id, "editor");
        } catch (error) {
            if (error instanceof Response) return error;
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

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
        if (invitedUser.id === session.user.id) {
            return NextResponse.json(
                { message: "You can't invite yourself" },
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

        return NextResponse.json({ collaborator: newCollaborator }, { status: 201 });
    } catch (error) {
        console.error("Error adding collaborator:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
