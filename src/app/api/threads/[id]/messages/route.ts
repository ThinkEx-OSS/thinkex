import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chatThreads, chatMessages } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq, and, desc } from "drizzle-orm";

async function getThreadAndVerify(id: string, userId: string) {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.id, id))
    .limit(1);

  if (!thread) {
    throw NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  await verifyWorkspaceAccess(thread.workspaceId, userId);

  return thread;
}

/**
 * GET /api/threads/[id]/messages?format=ai-sdk/v6
 * Load messages for a thread. Format filter is strict (ai-sdk/v6 only).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") ?? "ai-sdk/v6";

    await getThreadAndVerify(id, userId);

    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.threadId, id), eq(chatMessages.format, format)))
      .orderBy(desc(chatMessages.createdAt));

    const messages = rows.map((r) => ({
        id: r.messageId,
        parent_id: r.parentId,
        format: r.format,
        content: r.content,
        created_at: r.createdAt,
      }));

    return NextResponse.json({ messages });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] messages GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/threads/[id]/messages
 * Append a message to a thread
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { messageId, parentId, format, content } = body;

    if (!messageId || !format || content === undefined) {
      return NextResponse.json(
        { error: "messageId, format, and content are required" },
        { status: 400 }
      );
    }

    const thread = await getThreadAndVerify(id, userId);

    await db.insert(chatMessages).values({
      threadId: id,
      messageId: String(messageId),
      parentId: parentId ?? null,
      format: String(format),
      content: typeof content === "object" ? content : { raw: content },
    });

    await db
      .update(chatThreads)
      .set({
        lastMessageAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(chatThreads.id, id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] messages POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
