import {
  ApplicationError,
  type Transaction,
  defineMutatorWithType,
  defineMutatorsWithType,
} from "@rocicorp/zero";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  workspaceCollaborators,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItemUserState,
  workspaceItems,
  workspaces,
} from "@/lib/db/schema";
import {
  buildWorkspaceItemTableRows,
  rehydrateWorkspaceItem,
} from "@/lib/workspace/workspace-item-model";
import { mutators, zeroMutatorSchemas } from "./mutators";
import type { ZeroContext } from "./client";
import { schema } from "./zero-schema.gen";

const defineServerMutator = defineMutatorWithType<
  typeof schema,
  ZeroContext,
  DrizzleTransaction<typeof db>
>();
const defineServerMutators = defineMutatorsWithType<typeof schema>();
type ServerZeroTx = Transaction<typeof schema, DrizzleTransaction<typeof db>>;

async function assertWorkspaceWriteAccess(
  wrappedTx: DrizzleTransaction<typeof db>,
  workspaceId: string,
  userId: string | null,
) {
  if (!userId) {
    throw new ApplicationError("Unauthorized");
  }

  const [workspace] = await wrappedTx
    .select({ ownerId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new ApplicationError("Workspace not found", {
      details: { workspaceId },
    });
  }

  if (workspace.ownerId === userId) {
    return;
  }

  const [collaborator] = await wrappedTx
    .select({ permissionLevel: workspaceCollaborators.permissionLevel })
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, workspaceId),
        eq(workspaceCollaborators.userId, userId),
      ),
    )
    .limit(1);

  if (!collaborator || collaborator.permissionLevel !== "editor") {
    throw new ApplicationError("Editor access required", {
      details: { workspaceId, userId },
    });
  }
}

async function syncExtractedRow(
  wrappedTx: DrizzleTransaction<typeof db>,
  params: {
    workspaceId: string;
    itemId: string;
    userId: string | null;
  },
) {
  const [shell] = await wrappedTx
    .select()
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        eq(workspaceItems.itemId, params.itemId),
      ),
    )
    .limit(1);

  if (!shell) {
    await wrappedTx
      .delete(workspaceItemExtracted)
      .where(
        and(
          eq(workspaceItemExtracted.workspaceId, params.workspaceId),
          eq(workspaceItemExtracted.itemId, params.itemId),
        ),
      );
    return;
  }

  const [content] = await wrappedTx
    .select()
    .from(workspaceItemContent)
    .where(
      and(
        eq(workspaceItemContent.workspaceId, params.workspaceId),
        eq(workspaceItemContent.itemId, params.itemId),
      ),
    )
    .limit(1);

  const userStates = params.userId
    ? await wrappedTx
        .select()
        .from(workspaceItemUserState)
        .where(
          and(
            eq(workspaceItemUserState.workspaceId, params.workspaceId),
            eq(workspaceItemUserState.itemId, params.itemId),
            eq(workspaceItemUserState.userId, params.userId),
          ),
        )
    : [];

  const item = rehydrateWorkspaceItem({
    shell: {
      itemId: shell.itemId,
      type: shell.type as never,
      name: shell.name,
      subtitle: shell.subtitle,
      color: (shell.color as never) ?? null,
      folderId: shell.folderId ?? null,
      layout: (shell.layout as never) ?? null,
      lastModified: shell.lastModified ?? null,
      ocrStatus: shell.ocrStatus ?? null,
      processingStatus: shell.processingStatus ?? null,
    },
    content: content
      ? {
          textContent: content.textContent ?? null,
          structuredData:
            (content.structuredData as Record<string, unknown> | null) ?? null,
          assetData:
            (content.assetData as Record<string, unknown> | null) ?? null,
          embedData:
            (content.embedData as Record<string, unknown> | null) ?? null,
          sourceData: (content.sourceData as never[] | null) ?? null,
        }
      : null,
    userStates: userStates.map((row) => ({
      stateKey: row.stateKey,
      stateType: row.stateType as never,
      stateSchemaVersion: row.stateSchemaVersion,
      state: row.state as Record<string, unknown>,
    })),
  });

  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item,
    sourceVersion: shell.sourceVersion,
    userId: params.userId ?? undefined,
  });

  await wrappedTx
    .insert(workspaceItemExtracted)
    .values({
      workspaceId: params.workspaceId,
      itemId: params.itemId,
      searchText: rows.extracted.searchText,
      contentPreview: rows.extracted.contentPreview,
      ocrText: rows.extracted.ocrText,
      ocrPages: rows.extracted.ocrPages,
      transcriptText: rows.extracted.transcriptText,
      transcriptSegments: rows.extracted.transcriptSegments,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [workspaceItemExtracted.workspaceId, workspaceItemExtracted.itemId],
      set: {
        searchText: rows.extracted.searchText,
        contentPreview: rows.extracted.contentPreview,
        ocrText: rows.extracted.ocrText,
        ocrPages: rows.extracted.ocrPages,
        transcriptText: rows.extracted.transcriptText,
        transcriptSegments: rows.extracted.transcriptSegments,
        updatedAt: new Date().toISOString(),
      },
    });
}

async function syncExtractedRows(
  wrappedTx: DrizzleTransaction<typeof db>,
  params: {
    workspaceId: string;
    itemIds: string[];
    userId: string | null;
  },
) {
  for (const itemId of params.itemIds) {
    await syncExtractedRow(wrappedTx, {
      workspaceId: params.workspaceId,
      itemId,
      userId: params.userId,
    });
  }
}

function getWrappedTransaction(
  tx: ServerZeroTx,
) {
  if (tx.location !== "server") {
    throw new ApplicationError("Server-only mutator");
  }

  return tx.dbTransaction.wrappedTransaction;
}

export const serverMutators = defineServerMutators(mutators, {
  item: {
    create: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.create.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.create.fn({ tx, ctx, args: parsed });
      await syncExtractedRows(wrappedTx, {
        workspaceId: parsed.workspaceId,
        itemIds: [parsed.id],
        userId: ctx.userId,
      });
    }),
    update: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.update.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.update.fn({ tx, ctx, args: parsed });
      await syncExtractedRows(wrappedTx, {
        workspaceId: parsed.workspaceId,
        itemIds: [parsed.id],
        userId: ctx.userId,
      });
    }),
    delete: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.delete.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await wrappedTx
        .delete(workspaceItemExtracted)
        .where(
          and(
            eq(workspaceItemExtracted.workspaceId, parsed.workspaceId),
            eq(workspaceItemExtracted.itemId, parsed.id),
          ),
        );
      await mutators.item.delete.fn({ tx, ctx, args: parsed });
    }),
    createMany: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.createMany.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.createMany.fn({ tx, ctx, args: parsed });
      await syncExtractedRows(wrappedTx, {
        workspaceId: parsed.workspaceId,
        itemIds: parsed.items.map((item) => item.id),
        userId: ctx.userId,
      });
    }),
    patchMany: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.patchMany.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.patchMany.fn({ tx, ctx, args: parsed });
      await syncExtractedRows(wrappedTx, {
        workspaceId: parsed.workspaceId,
        itemIds: parsed.updates.map((update) => update.id),
        userId: ctx.userId,
      });
    }),
    updateMany: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.updateMany.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.updateMany.fn({ tx, ctx, args: parsed });
      const affectedIds = parsed.deletedIds?.length
        ? parsed.deletedIds
        : parsed.addedItems?.length
          ? parsed.addedItems.map((item) => item.id)
          : (parsed.layoutUpdates ?? []).map((update) => update.id);
      await syncExtractedRows(wrappedTx, {
        workspaceId: parsed.workspaceId,
        itemIds: affectedIds,
        userId: ctx.userId,
      });
    }),
    move: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.move.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.move.fn({ tx, ctx, args: parsed });
    }),
    moveMany: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.moveMany.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.item.moveMany.fn({ tx, ctx, args: parsed });
    }),
  },
  folder: {
    createWithItems: defineServerMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.folder.createWithItems.parse(args);
      const wrappedTx = getWrappedTransaction(tx);
      await assertWorkspaceWriteAccess(wrappedTx, parsed.workspaceId, ctx.userId);
      await mutators.folder.createWithItems.fn({ tx, ctx, args: parsed });
      await syncExtractedRows(wrappedTx, {
        workspaceId: parsed.workspaceId,
        itemIds: [parsed.folder.id],
        userId: ctx.userId,
      });
    }),
  },
});
