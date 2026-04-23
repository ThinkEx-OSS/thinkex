import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  withErrorHandling,
  requireAuth,
  verifyWorkspaceAccess,
} from "@/lib/api/workspace-helpers";
import { db } from "@/lib/db/client";
import { workspaceShareLinks } from "@/lib/db/schema";
import { generateSecureToken } from "@/lib/utils/generate-token";

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
      token = generateSecureToken();
      await db
        .update(workspaceShareLinks)
        .set({ token, expiresAt: expiresAt.toISOString() })
        .where(eq(workspaceShareLinks.id, existing.id));
    } else {
      token = existing.token;
    }
  } else {
    token = generateSecureToken();
    await db.insert(workspaceShareLinks).values({
      workspaceId,
      token,
      permissionLevel: "editor",
      expiresAt: expiresAt.toISOString(),
    });
  }

  const baseUrl = request.nextUrl.origin;
  const url = `${baseUrl}/invite/claim/${token}`;

  return NextResponse.json({ token, url });
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireAuth();
  const { id: workspaceId } = await params;

  await verifyWorkspaceAccess(workspaceId, userId, "editor");

  const [shareLink] = await db
    .select({ claimCount: workspaceShareLinks.claimCount })
    .from(workspaceShareLinks)
    .where(eq(workspaceShareLinks.workspaceId, workspaceId))
    .limit(1);

  return NextResponse.json({ claimCount: shareLink?.claimCount ?? 0 });
}

export const GET = withErrorHandling(
  handleGET,
  "GET /api/workspaces/[id]/share-link",
);

export const POST = withErrorHandling(
  handlePOST,
  "POST /api/workspaces/[id]/share-link",
);
