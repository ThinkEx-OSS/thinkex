import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
} from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  buildGatewayProviderOptions,
  createGatewayLanguageModel,
  getGatewayAttributionHeaders,
} from "@/lib/ai/gateway-provider-options";
import { getDefaultChatModelId, resolveGatewayModelId } from "@/lib/ai/models";
import { maybeWithSupermemory } from "@/lib/ai/supermemory";
import { maybeGenerateChatTitle } from "@/lib/chat-v2/generate-title";
import { postRequestBodySchema } from "@/lib/chat-v2/types";
import {
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/lib/chat-v2/queries";
import { convertToUIMessages, isUuid } from "@/lib/chat-v2/utils";

export const maxDuration = 60;

export async function POST(request: Request) {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const parsed = postRequestBodySchema.safeParse(json);

  if (!parsed.success) {
    return new Response("Bad request", { status: 400 });
  }

  const { id: chatId, message } = parsed.data;
  const userId = session.user.id;

  const existing = await getChatById({ id: chatId });
  if (existing) {
    if (existing.userId !== userId) {
      return new Response("Forbidden", { status: 403 });
    }
  } else {
    await saveChat({ id: chatId, userId, title: "New chat" });
  }

  const dbMessages = await getMessagesByChatId({ id: chatId });
  const uiMessages = [...convertToUIMessages(dbMessages), message];

  await saveMessages({
    messages: [
      {
        id: message.id,
        chatId,
        role: "user",
        parts: message.parts,
        createdAt: new Date().toISOString(),
      },
    ],
  });

  const firstUserTextPart = (message.parts as Array<{ type: string; text?: string }>).find(
    (p) => p.type === "text" && typeof p.text === "string",
  );
  const firstUserText = firstUserTextPart?.text ?? "";
  const currentTitle = existing?.title ?? "New chat";

  const modelId = resolveGatewayModelId(
    parsed.data.modelId || getDefaultChatModelId(),
  );
  const model = createGatewayLanguageModel(modelId);
  const providerOptions = buildGatewayProviderOptions(modelId, { userId });
  const attributionHeaders = getGatewayAttributionHeaders();

  const baseSystem = "You are a helpful assistant. Keep responses concise and direct.";
  const workspaceId = parsed.data.workspaceId ?? null;
  const selectedCardsContext = parsed.data.selectedCardsContext ?? "";
  const activeFolderId = parsed.data.activeFolderId ?? null;
  const memoryEnabled = parsed.data.memoryEnabled === true;

  const systemSegments: string[] = [baseSystem];
  if (workspaceId) {
    systemSegments.push(`Workspace ID: ${workspaceId}`);
  }
  if (activeFolderId) {
    systemSegments.push(`Active folder: ${activeFolderId}`);
  }
  if (selectedCardsContext.trim()) {
    systemSegments.push(`Selected cards context:\n${selectedCardsContext.trim()}`);
  }
  const system = systemSegments.join("\n\n");

  const modelMessages = await convertToModelMessages(uiMessages);
  const wrappedModel = maybeWithSupermemory(model, {
    userId,
    threadId: chatId,
    memoryEnabled,
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: wrappedModel,
        system,
        messages: modelMessages,
        providerOptions: providerOptions as any,
        headers: attributionHeaders,
        experimental_transform: smoothStream({ chunking: "word", delayInMs: 15 }),
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            "tcc.conversational": "true",
            "tcc.sessionId": chatId,
            ...(userId ? { userId } : {}),
          },
        },
      });

      writer.merge(result.toUIMessageStream({ sendReasoning: true }));
    },
    generateId: () => crypto.randomUUID(),
    onFinish: async ({ messages: finished }) => {
      const assistantMessages = finished.filter((message) => message.role === "assistant");

      if (assistantMessages.length === 0) {
        return;
      }

      const createdAt = new Date().toISOString();
      await saveMessages({
        messages: assistantMessages.map((message) => ({
          id: message.id,
          chatId,
          role: message.role,
          parts: message.parts,
          createdAt,
        })),
      });

      void maybeGenerateChatTitle({
        chatId,
        userId,
        firstUserMessageText: firstUserText,
        currentTitle,
      });
    },
    onError: () => "Oops, an error occurred!",
  });

  return createUIMessageStreamResponse({ stream });
}

export async function DELETE(request: Request) {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!isUuid(id)) {
    return new Response("Invalid id", { status: 400 });
  }

  const existing = await getChatById({ id });

  if (!existing) {
    return new Response("Not found", { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  await deleteChatById({ id });

  return Response.json({ ok: true });
}
