import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { db } from "@/lib/db/client";
import { chatThreads } from "@/lib/db/schema";
import {
  requireAuth,
  verifyWorkspaceAccess,
  verifyThreadOwnership,
} from "@/lib/api/workspace-helpers";
import { eq } from "drizzle-orm";
import { withServerObservability } from "@/lib/with-server-observability";
import { getGatewayModelIdForPurpose } from "@/lib/ai/models";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";

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
 * Generate a title from messages using Gemini Flash Lite.
 * Body: { messages: ThreadMessage[] }
 */
export const POST = withServerObservability(
  async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
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
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 },
        );
      }

      await verifyWorkspaceAccess(thread.workspaceId, userId);
      verifyThreadOwnership(thread, userId);

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
            const gatewayModelId =
              getGatewayModelIdForPurpose("title-generation");
            const { text, providerMetadata } = await generateText({
              model: createGatewayLanguageModel(gatewayModelId),
              providerOptions: buildGatewayProviderOptions(gatewayModelId, {
                userId,
              }) as any,
              headers: getGatewayAttributionHeaders(),
              system: `Generate a very short chat title (2-6 words) that captures the topic. Output ONLY the title, no quotes or punctuation.`,
              prompt: `Conversation:\n\n${conversationText}\n\nTitle:`,
              experimental_telemetry: {
                isEnabled: true,
                metadata: {
                  "tcc.sessionId": id,
                  ...(userId ? { userId } : {}),
                },
              },
            });
            const provider =
              (providerMetadata as any)?.gateway?.routing?.resolvedProvider ??
              (providerMetadata as any)?.gateway?.routing?.finalProvider;
            if (provider) {
              console.log(
                "[threads/title] Gateway resolved provider:",
                provider,
              );
            }
            const generated = text.trim().slice(0, 60);
            if (generated) title = generated;
          } catch (err) {
            console.warn("[threads] title Gemini fallback:", err);
            const firstUser = messages.find(
              (m: { role?: string }) => m.role === "user",
            );
            const fallback = extractTextFromMessage(firstUser ?? {});
            if (fallback) {
              title =
                fallback.slice(0, 50) + (fallback.length > 50 ? "..." : "");
            }
          }
        }
      }

      await db.update(chatThreads).set({ title }).where(eq(chatThreads.id, id));

      return NextResponse.json({ title });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error("[threads] title error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  },
  { routeName: "POST /api/threads/[id]/title" },
);
