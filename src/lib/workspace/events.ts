import { and, desc, eq, gte } from "drizzle-orm";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import type { db } from "@/lib/db/client";
import { user, workspaceEvents } from "@/lib/db/schema";
import { logger } from "@/lib/utils/logger";

export type WorkspaceEventAction =
  | "item_created"
  | "item_renamed"
  | "item_updated"
  | "item_deleted"
  | "item_moved"
  | "folder_created";

const COALESCEABLE_ACTIONS = new Set<WorkspaceEventAction>([
  "item_updated",
  "item_renamed",
  "item_moved",
]);

const COALESCE_WINDOW_MS = 5 * 60 * 1000;

export interface RecordEventInput {
  workspaceId: string;
  userId: string;
  itemId: string | null;
  itemType: string | null;
  itemName: string | null;
  action: WorkspaceEventAction;
  summary: Record<string, unknown>;
}

type WrappedTx = DrizzleTransaction<typeof db>;

export async function recordEvent(
  tx: WrappedTx,
  input: RecordEventInput,
): Promise<void> {
  const now = new Date().toISOString();

  if (COALESCEABLE_ACTIONS.has(input.action) && input.itemId) {
    const fiveMinAgo = new Date(Date.now() - COALESCE_WINDOW_MS).toISOString();
    const existing = await tx
      .select()
      .from(workspaceEvents)
      .where(
        and(
          eq(workspaceEvents.workspaceId, input.workspaceId),
          eq(workspaceEvents.userId, input.userId),
          eq(workspaceEvents.itemId, input.itemId),
          eq(workspaceEvents.action, input.action),
          gte(workspaceEvents.updatedAt, fiveMinAgo),
        ),
      )
      .orderBy(desc(workspaceEvents.updatedAt))
      .limit(1);

    if (existing.length > 0) {
      const recent = existing[0];
      const mergedSummary = mergeSummary(
        (recent.summary as Record<string, unknown>) ?? {},
        input.summary,
        input.action,
      );
      await tx
        .update(workspaceEvents)
        .set({
          updatedAt: now,
          editCount: recent.editCount + 1,
          itemName: input.itemName ?? recent.itemName,
          summary: mergedSummary,
        })
        .where(eq(workspaceEvents.id, recent.id));
      return;
    }
  }

  let actorName: string | null = null;
  let actorImage: string | null = null;
  try {
    const [actor] = await tx
      .select({ name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, input.userId))
      .limit(1);
    actorName = actor?.name ?? null;
    actorImage = actor?.image ?? null;
  } catch (err) {
    logger.warn(
      "[workspace-events]",
      "Failed to look up actor for workspace event; continuing with null actor",
      err,
    );
  }

  await tx.insert(workspaceEvents).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    actorName,
    actorImage,
    itemId: input.itemId,
    itemType: input.itemType,
    itemName: input.itemName,
    action: input.action,
    summary: input.summary as never,
    editCount: 1,
    createdAt: now,
    updatedAt: now,
  });
}

export function mergeSummary(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  action: WorkspaceEventAction,
): Record<string, unknown> {
  switch (action) {
    case "item_renamed":
      return { from: prev.from ?? next.from, to: next.to };
    case "item_moved":
      return {
        fromFolderId: prev.fromFolderId ?? next.fromFolderId,
        fromFolderName: prev.fromFolderName ?? next.fromFolderName,
        toFolderId: next.toFolderId,
        toFolderName: next.toFolderName,
      };
    case "item_updated": {
      const prevFields = Array.isArray(prev.fields)
        ? (prev.fields as string[])
        : [];
      const nextFields = Array.isArray(next.fields)
        ? (next.fields as string[])
        : [];
      return { fields: Array.from(new Set([...prevFields, ...nextFields])) };
    }
    default:
      return next;
  }
}
