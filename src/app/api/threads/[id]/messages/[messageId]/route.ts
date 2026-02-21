import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq, and } from "drizzle-orm";

async function getThreadAndVerify(threadId: string, userId: string) {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, threadId))
    .limit(1);

  if (!thread) {
    throw NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(thread.workspaceId, userId);

  return thread;
}

/**
 * PATCH /api/threads/[id]/messages/[messageId]
 * Update an existing message (e.g. step timestamps/duration from useExternalHistory)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id: threadId, messageId } = await params;
    const body = await req.json().catch(() => ({}));
    const { format, content } = body;

    if (!format || content === undefined) {
      return NextResponse.json(
        { error: "format and content are required" },
        { status: 400 }
      );
    }

    await getThreadAndVerify(threadId, userId);

    const [updated] = await db
      .update(chatMessages)
      .set({
        content: typeof content === "object" ? content : { raw: content },
      })
      .where(
        and(
          eq(chatMessages.threadId, threadId),
          eq(chatMessages.messageId, messageId)
        )
      )
      .returning({ messageId: chatMessages.messageId });

    if (!updated) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] messages PATCH error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
