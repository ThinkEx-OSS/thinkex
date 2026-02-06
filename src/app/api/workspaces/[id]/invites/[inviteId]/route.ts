
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceInvites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { withErrorHandling, requireAuth, verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";

// DELETE /api/workspaces/[id]/invites/[inviteId]
async function handleDELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
    const { id: workspaceId, inviteId } = await params;
    const userId = await requireAuth();

    // Verify access (only editors/owners can revoke)
    await verifyWorkspaceAccess(workspaceId, userId, "editor");

    // Check if invite exists and belongs to workspace
    const [invite] = await db
        .select()
        .from(workspaceInvites)
        .where(and(
            eq(workspaceInvites.id, inviteId),
            eq(workspaceInvites.workspaceId, workspaceId)
        ))
        .limit(1);

    if (!invite) {
        return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    // Delete the invite
    await db
        .delete(workspaceInvites)
        .where(eq(workspaceInvites.id, inviteId));

    return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandling(handleDELETE, "DELETE /api/workspaces/[id]/invites/[inviteId]");
