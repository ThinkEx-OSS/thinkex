import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getChatById, getMessagesByChatId } from "@/lib/chat-v2/queries";
import { convertToUIMessages, isUuid } from "@/lib/chat-v2/utils";

export async function GET(request: Request) {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!isUuid(chatId)) {
    return new Response("Invalid chatId", { status: 400 });
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return Response.json({ messages: [], isReadonly: false });
  }

  if (chat.userId !== session.user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const messages = await getMessagesByChatId({ id: chatId });

  return Response.json({
    messages: convertToUIMessages(messages),
    isReadonly: false,
  });
}
