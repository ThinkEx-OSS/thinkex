import {
  ApplicationError,
  type Transaction,
  defineMutator,
  defineMutators,
} from "@rocicorp/zero";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  workspaceCollaborators,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
  workspaces,
} from "@/lib/db/schema";
import {
  buildWorkspaceItemTableRows,
  rehydrateWorkspaceItem,
} from "@/lib/workspace/workspace-item-model";
import { mutators as sharedMutators, zeroMutatorSchemas } from "./mutators";
import { schema } from "./zero-schema.gen";

type ServerZeroTx = Transaction<typeof schema, DrizzleTransaction<typeof db>>;

type WorkspaceArgs = { workspaceId: string };

type SharedServerMutator = {
  fn: (params: { tx: any; ctx: any; args: any }) => Promise<void>;
};

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
  });

  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item,
    sourceVersion: shell.sourceVersion,
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
      target: [
        workspaceItemExtracted.workspaceId,
        workspaceItemExtracted.itemId,
      ],
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

function getWrappedTransaction(tx: ServerZeroTx) {
  if (tx.location !== "server") {
    throw new ApplicationError("Server-only mutator");
  }

  return tx.dbTransaction.wrappedTransaction;
}

function withAuth<TArgs extends WorkspaceArgs>(
  schema: z.ZodType<TArgs>,
  sharedMutator: SharedServerMutator,
  getItemIds: (args: TArgs) => string[],
) {
  return defineMutator(schema as any, async ({ tx, ctx, args }) => {
    const validatedArgs = args as unknown as TArgs;
    const wrappedTx = getWrappedTransaction(tx as ServerZeroTx);
    await assertWorkspaceWriteAccess(
      wrappedTx,
      validatedArgs.workspaceId,
      ctx.userId,
    );
    await sharedMutator.fn({ tx, ctx, args: validatedArgs });

    const itemIds = [...new Set(getItemIds(validatedArgs))];
    if (itemIds.length > 0) {
      await syncExtractedRows(wrappedTx, {
        workspaceId: validatedArgs.workspaceId,
        itemIds,
        userId: ctx.userId,
      });
    }
  });
}

function withAuthOnly<TArgs extends WorkspaceArgs>(
  schema: z.ZodType<TArgs>,
  sharedMutator: SharedServerMutator,
) {
  return defineMutator(schema as any, async ({ tx, ctx, args }) => {
    const validatedArgs = args as unknown as TArgs;
    const wrappedTx = getWrappedTransaction(tx as ServerZeroTx);
    await assertWorkspaceWriteAccess(
      wrappedTx,
      validatedArgs.workspaceId,
      ctx.userId,
    );
    await sharedMutator.fn({ tx, ctx, args: validatedArgs });
  });
}

export const serverMutators = defineMutators(sharedMutators, {
  item: {
    create: withAuth(
      zeroMutatorSchemas.item.create,
      sharedMutators.item.create,
      (args) => [args.id],
    ),
    update: withAuth(
      zeroMutatorSchemas.item.update,
      sharedMutators.item.update,
      (args) => [args.id],
    ),
    delete: defineMutator(
      zeroMutatorSchemas.item.delete,
      async ({ tx, ctx, args }) => {
        const wrappedTx = getWrappedTransaction(tx as ServerZeroTx);
        await assertWorkspaceWriteAccess(
          wrappedTx,
          args.workspaceId,
          ctx.userId,
        );

        const [shell] = await wrappedTx
          .select({ type: workspaceItems.type })
          .from(workspaceItems)
          .where(
            and(
              eq(workspaceItems.workspaceId, args.workspaceId),
              eq(workspaceItems.itemId, args.id),
            ),
          )
          .limit(1);

        let childIds: string[] = [];
        if (shell?.type === "folder") {
          const children = await wrappedTx
            .select({ itemId: workspaceItems.itemId })
            .from(workspaceItems)
            .where(
              and(
                eq(workspaceItems.workspaceId, args.workspaceId),
                eq(workspaceItems.folderId, args.id),
              ),
            );
          childIds = children.map((child) => child.itemId);
        }

        await wrappedTx
          .delete(workspaceItemExtracted)
          .where(
            and(
              eq(workspaceItemExtracted.workspaceId, args.workspaceId),
              eq(workspaceItemExtracted.itemId, args.id),
            ),
          );
        await sharedMutators.item.delete.fn({ tx, ctx, args });

        if (childIds.length > 0) {
          await syncExtractedRows(wrappedTx, {
            workspaceId: args.workspaceId,
            itemIds: childIds,
            userId: ctx.userId,
          });
        }
      },
    ),
    createMany: withAuth(
      zeroMutatorSchemas.item.createMany,
      sharedMutators.item.createMany,
      (args) => args.items.map((item) => item.id),
    ),
    patchMany: withAuth(
      zeroMutatorSchemas.item.patchMany,
      sharedMutators.item.patchMany,
      (args) => args.updates.map((update) => update.id),
    ),
    updateMany: withAuth(
      zeroMutatorSchemas.item.updateMany,
      sharedMutators.item.updateMany,
      (args) => [
        ...(args.deletedIds ?? []),
        ...(args.addedItems ?? []).map((item) => item.id),
        ...(args.layoutUpdates ?? []).map((update) => update.id),
      ],
    ),
    move: withAuthOnly(zeroMutatorSchemas.item.move, sharedMutators.item.move),
    moveMany: withAuthOnly(
      zeroMutatorSchemas.item.moveMany,
      sharedMutators.item.moveMany,
    ),
  },
  folder: {
    createWithItems: withAuth(
      zeroMutatorSchemas.folder.createWithItems,
      sharedMutators.folder.createWithItems,
      (args) => [args.folder.id, ...args.itemIds],
    ),
  },
});
