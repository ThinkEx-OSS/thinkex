import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
  verifyThreadOwnership,
} from "@/lib/api/workspace-helpers";
import { eq, and } from "drizzle-orm";
import { withServerObservability } from "@/lib/with-server-observability";

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
  verifyThreadOwnership(thread, userId);

  return thread;
}

/**
 * GET /api/threads/[id]
 * Fetch a single thread
 */
export const GET = withServerObservability(async function GET(
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
}, { routeName: "GET /api/threads/[id]" });

/**
 * PATCH /api/threads/[id]
 * Update thread (e.g. rename)
 */
export const PATCH = withServerObservability(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { title, headMessageId } = body;

    await getThreadAndVerify(id, userId, "editor");

    const updates: Partial<{ title: string; headMessageId: string | null; updatedAt: string }> = {
      updatedAt: new Date().toISOString(),
    };
    if (title !== undefined) updates.title = String(title);
    if (headMessageId !== undefined) {
      if (headMessageId === null) {
        updates.headMessageId = null;
      } else {
        const msgId = String(headMessageId);
        const [existing] = await db
          .select({ messageId: chatMessages.messageId })
          .from(chatMessages)
          .where(
            and(eq(chatMessages.threadId, id), eq(chatMessages.messageId, msgId))
          )
          .limit(1);
        if (!existing) {
          return NextResponse.json(
            { error: "headMessageId must reference an existing message in this thread" },
            { status: 400 }
          );
        }
        updates.headMessageId = msgId;
      }
    }

    await db.update(chatThreads).set(updates).where(eq(chatThreads.id, id));

    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}, { routeName: "PATCH /api/threads/[id]" });

/**
 * DELETE /api/threads/[id]
 * Delete a thread (and its messages via cascade)
 */
export const DELETE = withServerObservability(async function DELETE(
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
}, { routeName: "DELETE /api/threads/[id]" });
