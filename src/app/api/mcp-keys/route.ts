import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { eq, and, isNull, count, sql } from "drizzle-orm";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";

const MAX_KEYS_PER_USER = 10;

// Deterministic i64 from a userId string — used as the advisory lock key.
// XOR-folds the SHA-256 bytes into 8 bytes so the result fits in a pg bigint.
function userIdToLockKey(userId: string): bigint {
  const hash = createHash("sha256").update(userId).digest();
  let lo = 0n;
  for (let i = 0; i < 32; i++) {
    lo ^= BigInt(hash[i]) << BigInt((i % 8) * 8);
  }
  // Clamp to signed int64 range so Postgres accepts it
  const MAX_I64 = 9223372036854775807n;
  return lo > MAX_I64 ? lo - (MAX_I64 + 1n) * 2n : lo;
}

async function handlePOST(req: Request) {
  const userId = await requireAuth();
  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.slice(0, 100) : null;

  const rawKey = `tx_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.substring(0, 8);
  const lockKey = userIdToLockKey(userId);

  const result = await db.transaction(async (tx) => {
    // Acquire a per-user advisory lock that is automatically released when
    // the transaction ends, serialising concurrent key-creation requests.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`);

    const [{ total }] = await tx
      .select({ total: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

    if (total >= MAX_KEYS_PER_USER) {
      return null;
    }

    const [inserted] = await tx
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

    return inserted;
  });

  if (!result) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_KEYS_PER_USER} active API keys. Revoke an existing key first.` },
      { status: 422 }
    );
  }

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
