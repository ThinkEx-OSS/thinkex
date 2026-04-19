import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getChatsByUserId } from "@/lib/chat-v2/queries";

export async function GET() {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const chats = await getChatsByUserId({ userId: session.user.id, limit: 100 });

  return Response.json({
    chats: chats.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}
