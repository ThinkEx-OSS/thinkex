import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq } from "drizzle-orm";

async function getThreadAndVerify(
  id: string,
  userId: string,
  permission: "viewer" | "editor" = "viewer"
) {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, id))
    .limit(1);

  if (!thread) {
    throw NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(thread.workspaceId, userId, permission);

  return thread;
}

/**
 * GET /api/threads/[id]
 * Fetch a single thread
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;

    const thread = await getThreadAndVerify(id, userId);

    return NextResponse.json({
      id: thread.id,
      remoteId: thread.id,
      status: thread.isArchived ? "archived" : "regular",
      title: thread.title ?? undefined,
      externalId: thread.externalId ?? undefined,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] GET [id] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/threads/[id]
 * Update thread (e.g. rename)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { title } = body;

    await getThreadAndVerify(id, userId, "editor");

    if (title !== undefined) {
      await db
        .update(chatThreads)
        .set({ title: String(title), updatedAt: new Date().toISOString() })
        .where(eq(chatThreads.id, id));
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/threads/[id]
 * Delete a thread (and its messages via cascade)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;

    await getThreadAndVerify(id, userId, "editor");

    await db.delete(chatThreads).where(eq(chatThreads.id, id));

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
