import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, workspaceItems, workspaceItemUserState } from "@/lib/db/client";
import {
  requireAuth,
  verifyWorkspaceAccess,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { extractWorkspaceItemUserState } from "@/lib/workspace/workspace-item-model";
import type { CardType, ItemData } from "@/lib/workspace-state/types";

const STORED_CARD_TYPES: CardType[] = [
  "pdf",
  "flashcard",
  "folder",
  "youtube",
  "quiz",
  "image",
  "audio",
  "website",
  "document",
];

function storedTypeToCardType(value: string): CardType | null {
  return STORED_CARD_TYPES.includes(value as CardType)
    ? (value as CardType)
    : null;
}

type UpdateWorkspaceItemUserStateBody = {
  itemId?: string;
  /** Ignored; item type is taken from the workspace_items row. */
  itemType?: CardType;
  data?: ItemData;
};

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id: workspaceId }, userId, body] = await Promise.all([
    params,
    requireAuth(),
    request.json() as Promise<UpdateWorkspaceItemUserStateBody>,
  ]);

  await verifyWorkspaceAccess(workspaceId, userId, "viewer");

  const itemId = body?.itemId;

  if (!itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const [workspaceItem] = await db
    .select({
      itemId: workspaceItems.itemId,
      type: workspaceItems.type,
    })
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, workspaceId),
        eq(workspaceItems.itemId, itemId),
      ),
    )
    .limit(1);

  if (!workspaceItem) {
    return NextResponse.json({ error: "Workspace item not found" }, { status: 404 });
  }

  const itemType = storedTypeToCardType(workspaceItem.type);
  if (!itemType) {
    return NextResponse.json(
      { error: "Workspace item has an invalid type" },
      { status: 500 },
    );
  }

  const userState = extractWorkspaceItemUserState(itemType, body?.data);

  if (!userState) {
    await db
      .delete(workspaceItemUserState)
      .where(
        and(
          eq(workspaceItemUserState.workspaceId, workspaceId),
          eq(workspaceItemUserState.itemId, itemId),
          eq(workspaceItemUserState.userId, userId),
        ),
      );

    return NextResponse.json({ success: true, cleared: true });
  }

  await db
    .insert(workspaceItemUserState)
    .values({
      workspaceId,
      itemId,
      userId,
      state: userState,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [
        workspaceItemUserState.workspaceId,
        workspaceItemUserState.itemId,
        workspaceItemUserState.userId,
      ],
      set: {
        state: userState,
        updatedAt: new Date().toISOString(),
      },
    });

  return NextResponse.json({ success: true, cleared: false });
}

export const POST = withErrorHandling(
  handlePOST,
  "POST /api/workspaces/[id]/item-user-state",
);
