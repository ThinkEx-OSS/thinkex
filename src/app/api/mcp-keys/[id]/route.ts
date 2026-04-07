import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id } = await params;

  const [key] = await db
    .select({ userId: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .limit(1);

  if (!key) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  if (key.userId !== userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, id));

  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandling(handleDELETE, "DELETE /api/mcp-keys/[id]");
