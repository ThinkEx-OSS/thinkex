/**
 * Collaborator API - Update and delete individual collaborators
 * 
 * PATCH /api/workspaces/[id]/collaborators/[collaboratorId] - Update permission
 * DELETE /api/workspaces/[id]/collaborators/[collaboratorId] - Remove collaborator
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyWorkspaceOwnership } from "@/lib/api/workspace-helpers";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId, collaboratorId } = await params;
        const body = await request.json();
        const { permissionLevel } = body;

        if (!permissionLevel || !["viewer", "editor"].includes(permissionLevel)) {
            return NextResponse.json({ error: "Invalid permission level" }, { status: 400 });
        }

        // Verify ownership
        try {
            await verifyWorkspaceOwnership(workspaceId, session.user.id);
        } catch (error) {
            if (error instanceof Response) return error;
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        // Update the collaborator
        const [updated] = await db
            .update(workspaceCollaborators)
            .set({ permissionLevel })
            .where(
                and(
                    eq(workspaceCollaborators.id, collaboratorId),
                    eq(workspaceCollaborators.workspaceId, workspaceId)
                )
            )
            .returning();

        if (!updated) {
            return NextResponse.json({ error: "Collaborator not found" }, { status: 404 });
        }

        return NextResponse.json({ collaborator: updated });
    } catch (error) {
        console.error("Error updating collaborator:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId, collaboratorId } = await params;

        // Verify ownership
        try {
            await verifyWorkspaceOwnership(workspaceId, session.user.id);
        } catch (error) {
            if (error instanceof Response) return error;
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        // Delete the collaborator
        const [deleted] = await db
            .delete(workspaceCollaborators)
            .where(
                and(
                    eq(workspaceCollaborators.id, collaboratorId),
                    eq(workspaceCollaborators.workspaceId, workspaceId)
                )
            )
            .returning();

        if (!deleted) {
            return NextResponse.json({ error: "Collaborator not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting collaborator:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
