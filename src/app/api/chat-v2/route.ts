import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
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
import { postRequestBodySchema } from "@/lib/chat-v2/types";
import {
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/lib/chat-v2/queries";
import { convertToUIMessages } from "@/lib/chat-v2/utils";

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

  const modelId = resolveGatewayModelId(getDefaultChatModelId());
  const model = createGatewayLanguageModel(modelId);
  const providerOptions = buildGatewayProviderOptions(modelId, { userId });
  const attributionHeaders = getGatewayAttributionHeaders();
  const modelMessages = await convertToModelMessages(uiMessages);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model,
        system: "You are a helpful assistant. Keep responses concise and direct.",
        messages: modelMessages,
        providerOptions: providerOptions as any,
        headers: attributionHeaders,
      });

      writer.merge(result.toUIMessageStream());
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

  if (!id) {
    return new Response("Missing id", { status: 400 });
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
