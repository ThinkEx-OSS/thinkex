import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { workspaceShareLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { withErrorHandling, requireAuth, verifyWorkspaceAccess } from "@/lib/api/workspace-helpers";

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id: workspaceId } = await params;

  await verifyWorkspaceAccess(workspaceId, userId, "editor");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const [existing] = await db
    .select()
    .from(workspaceShareLinks)
    .where(eq(workspaceShareLinks.workspaceId, workspaceId))
    .limit(1);

  let token: string;
  if (existing) {
    if (new Date(existing.expiresAt) < new Date()) {
      token = generateToken();
      await db
        .update(workspaceShareLinks)
        .set({ token, expiresAt: expiresAt.toISOString() })
        .where(eq(workspaceShareLinks.id, existing.id));
    } else {
      token = existing.token;
    }
  } else {
    token = generateToken();
    await db.insert(workspaceShareLinks).values({
      workspaceId,
      token,
      permissionLevel: "editor",
      expiresAt: expiresAt.toISOString(),
    });
  }

  const baseUrl = request.nextUrl.origin;
  const url = `${baseUrl}/invite/link/${token}`;

  return NextResponse.json({ token, url });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/share-link");
