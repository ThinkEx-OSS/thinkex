import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatV2, chatV2Message } from "@/lib/db/schema";

export async function getChatById({ id }: { id: string }) {
  const [chat] = await db.select().from(chatV2).where(eq(chatV2.id, id)).limit(1);
  return chat ?? null;
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  await db
    .insert(chatV2)
    .values({ id, userId, title })
    .onConflictDoNothing({ target: chatV2.id });
}

export async function deleteChatById({ id }: { id: string }) {
  await db.delete(chatV2).where(eq(chatV2.id, id));
}

export async function getMessagesByChatId({ id }: { id: string }) {
  return db
    .select()
    .from(chatV2Message)
    .where(eq(chatV2Message.chatId, id))
    .orderBy(asc(chatV2Message.createdAt));
}

export async function saveMessages({
  messages,
}: {
  messages: Array<{
    id: string;
    chatId: string;
    role: string;
    parts: unknown;
    createdAt: string;
  }>;
}) {
  if (messages.length === 0) {
    return;
  }

  await db
    .insert(chatV2Message)
    .values(messages)
    .onConflictDoNothing({ target: chatV2Message.id });

  const latestMessage = messages[messages.length - 1];
  if (latestMessage) {
    await db
      .update(chatV2)
      .set({ updatedAt: latestMessage.createdAt })
      .where(eq(chatV2.id, latestMessage.chatId));
  }
}

export async function getChatsByUserId({
  userId,
  limit,
}: {
  userId: string;
  limit: number;
}) {
  return db
    .select()
    .from(chatV2)
    .where(eq(chatV2.userId, userId))
    .orderBy(desc(chatV2.updatedAt), desc(chatV2.createdAt))
    .limit(limit);
}
