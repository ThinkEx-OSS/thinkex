import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { withServerObservability } from "@/lib/with-server-observability";
import { db } from "@/lib/db/client";
import { chatMessages, chatThreads } from "@/lib/db/schema";
import { requireAuth, verifyThreadOwnership, verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";
import type { UIMessage } from "ai";

export const POST = withServerObservability(async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth();
    const body = await req.json().catch(() => ({})) as { threadId?: string; messageId?: string; text?: string };
    if (!body.threadId || !body.messageId || typeof body.text !== "string") {
      return NextResponse.json({ error: "threadId, messageId, and text are required" }, { status: 400 });
    }

    const [thread] = await db.select().from(chatThreads).where(eq(chatThreads.id, body.threadId)).limit(1);
    if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    await verifyWorkspaceAccess(thread.workspaceId, userId);
    verifyThreadOwnership(thread, userId);

    const [stored] = await db.select().from(chatMessages).where(and(eq(chatMessages.threadId, body.threadId), eq(chatMessages.messageId, body.messageId))).limit(1);
    if (!stored) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const content = stored.content as UIMessage;
    if (content.role !== "user") {
      return NextResponse.json({ error: "Only user messages can be edited" }, { status: 400 });
    }

    const newMessageId = crypto.randomUUID();
    const nextMessage: UIMessage = {
      ...content,
      id: newMessageId,
      parts: (
        content.parts.some((part) => part.type === "text")
          ? content.parts.map((part) =>
              part.type === "text"
                ? { ...part, text: body.text }
                : part,
            )
          : [...content.parts, { type: "text", text: body.text }]
      ) as UIMessage["parts"],
    };

    await db.insert(chatMessages).values({
      threadId: body.threadId,
      messageId: newMessageId,
      parentId: stored.parentId,
      format: "ai-sdk/v6",
      content: nextMessage,
    });

    await db.update(chatThreads).set({
      headMessageId: newMessageId,
      updatedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    }).where(eq(chatThreads.id, body.threadId));

    return NextResponse.json({ newMessageId });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}, { routeName: "POST /api/chat-v2/edit" });
