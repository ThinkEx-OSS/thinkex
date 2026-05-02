/**
 * Leave workspace API - allow a collaborator to remove themselves
 *
 * POST /api/workspaces/[id]/leave - Remove the current user's
 * workspace_collaborators row for this workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { workspaceCollaborators, workspaces } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId } = await params;

        if (!UUID_REGEX.test(workspaceId)) {
            return NextResponse.json(
                { error: "Invalid workspace id" },
                { status: 400 }
            );
        }

        const userId = session.user.id;

        const [workspace] = await db
            .select({ userId: workspaces.userId })
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .limit(1);

        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found or you are not a collaborator" },
                { status: 404 }
            );
        }

        if (workspace.userId === userId) {
            return NextResponse.json(
                {
                    error:
                        "Workspace owners cannot leave their own workspace. Transfer ownership or delete the workspace instead.",
                },
                { status: 400 }
            );
        }

        const [deleted] = await db
            .delete(workspaceCollaborators)
            .where(
                and(
                    eq(workspaceCollaborators.workspaceId, workspaceId),
                    eq(workspaceCollaborators.userId, userId),
                )
            )
            .returning();

        if (!deleted) {
            return NextResponse.json(
                { error: "Workspace not found or you are not a collaborator" },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error leaving workspace:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
