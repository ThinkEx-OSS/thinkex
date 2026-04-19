import { headers } from "next/headers";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { chatV2 } from "@/lib/db/schema";
import { getChatById } from "@/lib/chat-v2/queries";
import { isUuid } from "@/lib/chat-v2/utils";

const PatchSchema = z.object({ title: z.string().trim().min(1).max(200) });

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Invalid id", { status: 400 });

  const json = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) return new Response("Bad request", { status: 400 });

  const existing = await getChatById({ id });
  if (!existing) return new Response("Not found", { status: 404 });
  if (existing.userId !== session.user.id) return new Response("Forbidden", { status: 403 });

  await db
    .update(chatV2)
    .set({ title: parsed.data.title, updatedAt: new Date().toISOString() })
    .where(eq(chatV2.id, id));

  return Response.json({ ok: true });
}
