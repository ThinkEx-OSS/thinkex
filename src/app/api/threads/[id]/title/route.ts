import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { db } from "@/lib/db/client";
import { chatThreads } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { eq } from "drizzle-orm";

/** Model ID used for processFiles and other lightweight tasks */
const GEMINI_FLASH_LITE_MODEL = "gemini-2.5-flash-lite";

function extractTextFromMessage(msg: { content?: unknown[] }): string {
  if (!msg.content || !Array.isArray(msg.content)) return "";
  return (msg.content as { type?: string; text?: string }[])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join(" ")
    .trim();
}

/**
 * POST /api/threads/[id]/title
 * Generate a title from messages using Gemini Flash Lite (same model as processFiles).
 * Body: { messages: ThreadMessage[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { messages } = body;

    const [thread] = await db
      .select()
      .from(chatThreads)
      .where(eq(chatThreads.id, id))
      .limit(1);

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    await verifyWorkspaceAccess(thread.workspaceId, userId);

    let title = "New Chat";

    if (messages && Array.isArray(messages) && messages.length > 0) {
      const conversationText = messages
        .slice(0, 6)
        .map((m: { role?: string; content?: unknown[] }) => {
          const text = extractTextFromMessage(m);
          if (!text) return "";
          const role = m.role === "user" ? "User" : "Assistant";
          return `${role}: ${text}`;
        })
        .filter(Boolean)
        .join("\n\n");

      if (conversationText.trim()) {
        try {
          const { text } = await generateText({
            model: google(GEMINI_FLASH_LITE_MODEL),
            system: `Generate a very short chat title (2-6 words) that captures the topic. Output ONLY the title, no quotes or punctuation.`,
            prompt: `Conversation:\n\n${conversationText}\n\nTitle:`,
          });
          const generated = text.trim().slice(0, 60);
          if (generated) title = generated;
        } catch (err) {
          console.warn("[threads] title Gemini fallback:", err);
          const firstUser = messages.find(
            (m: { role?: string }) => m.role === "user"
          );
          const fallback = extractTextFromMessage(firstUser ?? {});
          if (fallback) {
            title = fallback.slice(0, 50) + (fallback.length > 50 ? "..." : "");
          }
        }
      }
    }

    await db
      .update(chatThreads)
      .set({ title })
      .where(eq(chatThreads.id, id));

    return NextResponse.json({ title });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[threads] title error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
