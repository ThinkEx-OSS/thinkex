import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

async function handlePOST(req: Request) {
  const userId = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const label = body?.label || null;

  const rawKey = `tx_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.substring(0, 8);

  const [result] = await db
    .insert(apiKeys)
    .values({
      userId,
      keyHash,
      keyPrefix,
      label,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      lastUsedAt: null,
    })
    .returning({ id: apiKeys.id, prefix: apiKeys.keyPrefix });

  return NextResponse.json({
    id: result.id,
    rawKey,
    prefix: result.prefix,
  });
}

async function handleGET() {
  const userId = await requireAuth();

  const keys = await db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.keyPrefix,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(apiKeys.createdAt);

  return NextResponse.json({ keys });
}

export const POST = withErrorHandling(handlePOST, "POST /api/mcp-keys");
export const GET = withErrorHandling(handleGET, "GET /api/mcp-keys");
