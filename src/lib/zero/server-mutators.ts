import {
  ApplicationError,
  type Transaction,
  defineMutator,
  defineMutators,
} from "@rocicorp/zero";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import { and, eq, inArray } from "drizzle-orm";
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
  type WorkspaceItemExtractedProjection,
} from "@/lib/workspace/workspace-item-model";
import {
  recordEvent,
  type RecordEventInput,
  type WorkspaceEventAction,
} from "@/lib/workspace/events";
import { mutators as sharedMutators, zeroMutatorSchemas } from "./mutators";
import { schema } from "./zero-schema.gen";

type ServerZeroTx = Transaction<typeof schema, DrizzleTransaction<typeof db>>;

type WrappedTx = DrizzleTransaction<typeof db>;

type WorkspaceArgs = { workspaceId: string };

type SharedServerMutator = {
  fn: (params: { tx: any; ctx: any; args: any }) => Promise<void>;
};

type EventInput = Omit<RecordEventInput, "workspaceId" | "userId">;

interface ItemNameTypeFolder {
  name: string;
  type: string;
  folderId: string | null;
}

async function assertWorkspaceWriteAccess(
  wrappedTx: WrappedTx,
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

export async function syncExtractedRow(
  wrappedTx: WrappedTx,
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

  const [existingExtracted] = await wrappedTx
    .select()
    .from(workspaceItemExtracted)
    .where(
      and(
        eq(workspaceItemExtracted.workspaceId, params.workspaceId),
        eq(workspaceItemExtracted.itemId, params.itemId),
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
    extracted: existingExtracted
      ? {
          searchText: existingExtracted.searchText ?? "",
          contentPreview: existingExtracted.contentPreview ?? null,
          ocrText: existingExtracted.ocrText ?? null,
          ocrPages:
            (existingExtracted.ocrPages as WorkspaceItemExtractedProjection["ocrPages"]) ??
            null,
          transcriptText: existingExtracted.transcriptText ?? null,
          transcriptSegments:
            (existingExtracted.transcriptSegments as WorkspaceItemExtractedProjection["transcriptSegments"]) ??
            null,
        }
      : null,
  });

  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item,
    sourceVersion: shell.sourceVersion,
  });
  const updatedAt = new Date().toISOString();

  await wrappedTx
    .update(workspaceItems)
    .set({
      hasOcr: rows.item.hasOcr,
      ocrPageCount: rows.item.ocrPageCount,
      hasTranscript: rows.item.hasTranscript,
      contentHash: rows.item.contentHash,
    })
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        eq(workspaceItems.itemId, params.itemId),
      ),
    );

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
      updatedAt,
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
        updatedAt,
      },
    });
}

async function syncExtractedRows(
  wrappedTx: WrappedTx,
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

async function loadFolderName(
  tx: WrappedTx,
  workspaceId: string,
  folderId: string | null,
): Promise<string | null> {
  if (!folderId) return null;
  const [folder] = await tx
    .select({ name: workspaceItems.name })
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, workspaceId),
        eq(workspaceItems.itemId, folderId),
      ),
    )
    .limit(1);
  return folder?.name ?? null;
}

function changedKeysExcludingLastModified(
  changes: Record<string, unknown>,
): string[] {
  return Object.keys(changes).filter((k) => k !== "lastModified");
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

interface WithAuthAndEventsOptions<TArgs extends WorkspaceArgs, TPre> {
  getItemIds?: (args: TArgs, pre: TPre) => string[];
  capturePre?: (args: TArgs, tx: WrappedTx) => Promise<TPre>;
  preMutator?: (args: TArgs, pre: TPre, tx: WrappedTx) => Promise<void>;
  emitEvents: (args: TArgs, pre: TPre) => EventInput[];
}

function withAuthAndEvents<TArgs extends WorkspaceArgs, TPre>(
  schema: z.ZodType<TArgs>,
  sharedMutator: SharedServerMutator,
  options: WithAuthAndEventsOptions<TArgs, TPre>,
) {
  return defineMutator(schema as any, async ({ tx, ctx, args }) => {
    const validatedArgs = args as unknown as TArgs;
    const wrappedTx = getWrappedTransaction(tx as ServerZeroTx);
    await assertWorkspaceWriteAccess(
      wrappedTx,
      validatedArgs.workspaceId,
      ctx.userId,
    );

    const pre = options.capturePre
      ? await options.capturePre(validatedArgs, wrappedTx)
      : (null as TPre);

    if (options.preMutator) {
      await options.preMutator(validatedArgs, pre, wrappedTx);
    }

    await sharedMutator.fn({ tx, ctx, args: validatedArgs });

    const itemIds = options.getItemIds
      ? [...new Set(options.getItemIds(validatedArgs, pre))]
      : [];
    if (itemIds.length > 0) {
      await syncExtractedRows(wrappedTx, {
        workspaceId: validatedArgs.workspaceId,
        itemIds,
        userId: ctx.userId,
      });
    }

    if (!ctx.userId) return;
    for (const evt of options.emitEvents(validatedArgs, pre)) {
      await recordEvent(wrappedTx, {
        workspaceId: validatedArgs.workspaceId,
        userId: ctx.userId,
        ...evt,
      });
    }
  });
}

// `withAuth` and `withAuthOnly` are kept for any future mutator that should
// genuinely skip the audit log (none in V1).
export { withAuth as _withAuth, withAuthOnly as _withAuthOnly };

type ItemUpdateArgs = z.infer<typeof zeroMutatorSchemas.item.update>;
type ItemDeleteArgs = z.infer<typeof zeroMutatorSchemas.item.delete>;
type ItemPatchManyArgs = z.infer<typeof zeroMutatorSchemas.item.patchMany>;
type ItemUpdateManyArgs = z.infer<typeof zeroMutatorSchemas.item.updateMany>;
type ItemMoveArgs = z.infer<typeof zeroMutatorSchemas.item.move>;
type ItemMoveManyArgs = z.infer<typeof zeroMutatorSchemas.item.moveMany>;

interface DeletePre {
  item: { name: string; type: string } | null;
  childIds: string[];
}

interface MovePre {
  item: ItemNameTypeFolder | null;
  fromFolderName: string | null;
  toFolderName: string | null;
}

interface MoveManyPre {
  items: Map<string, ItemNameTypeFolder>;
  folderNames: Map<string, string>;
  toFolderName: string | null;
}

export const serverMutators = defineMutators(sharedMutators, {
  item: {
    create: withAuthAndEvents(
      zeroMutatorSchemas.item.create,
      sharedMutators.item.create,
      {
        getItemIds: (args) => [args.id],
        emitEvents: (args) => [
          {
            itemId: args.id,
            itemType: args.item.type,
            itemName: args.item.name,
            action: "item_created",
            summary: { itemType: args.item.type },
          },
        ],
      },
    ),
    update: withAuthAndEvents<ItemUpdateArgs, ItemNameTypeFolder | null>(
      zeroMutatorSchemas.item.update,
      sharedMutators.item.update,
      {
        getItemIds: (args) => [args.id],
        capturePre: async (args, tx) => {
          const [shell] = await tx
            .select({
              name: workspaceItems.name,
              type: workspaceItems.type,
              folderId: workspaceItems.folderId,
            })
            .from(workspaceItems)
            .where(
              and(
                eq(workspaceItems.workspaceId, args.workspaceId),
                eq(workspaceItems.itemId, args.id),
              ),
            )
            .limit(1);
          return shell ?? null;
        },
        emitEvents: (args, pre) => {
          if (!pre) return [];
          const changedKeys = changedKeysExcludingLastModified(
            args.changes as Record<string, unknown>,
          );
          if (changedKeys.length === 0) return [];

          const newName = args.changes.name;
          if (newName !== undefined && newName !== pre.name) {
            return [
              {
                itemId: args.id,
                itemType: pre.type,
                itemName: newName,
                action: "item_renamed",
                summary: { from: pre.name, to: newName },
              },
            ];
          }
          return [
            {
              itemId: args.id,
              itemType: pre.type,
              itemName: pre.name,
              action: "item_updated",
              summary: { fields: changedKeys },
            },
          ];
        },
      },
    ),
    delete: withAuthAndEvents<ItemDeleteArgs, DeletePre>(
      zeroMutatorSchemas.item.delete,
      sharedMutators.item.delete,
      {
        capturePre: async (args, tx) => {
          const [shell] = await tx
            .select({
              name: workspaceItems.name,
              type: workspaceItems.type,
            })
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
            const children = await tx
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
          return { item: shell ?? null, childIds };
        },
        preMutator: async (args, _pre, tx) => {
          // Defensive cleanup mirroring the FK ON DELETE CASCADE — keeps
          // server tests with non-cascading mocks honest, no-op in prod.
          await tx
            .delete(workspaceItemExtracted)
            .where(
              and(
                eq(workspaceItemExtracted.workspaceId, args.workspaceId),
                eq(workspaceItemExtracted.itemId, args.id),
              ),
            );
        },
        getItemIds: (_args, pre) => pre.childIds,
        emitEvents: (args, pre) => {
          if (!pre.item) return [];
          return [
            {
              itemId: args.id,
              itemType: pre.item.type,
              itemName: pre.item.name,
              action: "item_deleted",
              summary: { itemType: pre.item.type },
            },
          ];
        },
      },
    ),
    createMany: withAuthAndEvents(
      zeroMutatorSchemas.item.createMany,
      sharedMutators.item.createMany,
      {
        getItemIds: (args) => args.items.map((item) => item.id),
        emitEvents: (args) =>
          args.items.map<EventInput>((item) => ({
            itemId: item.id,
            itemType: item.type,
            itemName: item.name,
            action: "item_created",
            summary: { itemType: item.type },
          })),
      },
    ),
    patchMany: withAuthAndEvents<
      ItemPatchManyArgs,
      Map<string, ItemNameTypeFolder>
    >(zeroMutatorSchemas.item.patchMany, sharedMutators.item.patchMany, {
      getItemIds: (args) => args.updates.map((update) => update.id),
      capturePre: async (args, tx) => {
        const ids = args.updates.map((u) => u.id);
        if (ids.length === 0) return new Map();
        const rows = await tx
          .select({
            itemId: workspaceItems.itemId,
            name: workspaceItems.name,
            type: workspaceItems.type,
            folderId: workspaceItems.folderId,
          })
          .from(workspaceItems)
          .where(
            and(
              eq(workspaceItems.workspaceId, args.workspaceId),
              inArray(workspaceItems.itemId, ids),
            ),
          );
        return new Map(rows.map((r) => [r.itemId, r]));
      },
      emitEvents: (args, preMap) => {
        const events: EventInput[] = [];
        for (const update of args.updates) {
          const pre = preMap.get(update.id);
          if (!pre) continue;
          const changedKeys = changedKeysExcludingLastModified(
            update.changes as Record<string, unknown>,
          );
          if (changedKeys.length === 0) continue;

          const newName = update.changes.name;
          if (newName !== undefined && newName !== pre.name) {
            events.push({
              itemId: update.id,
              itemType: pre.type,
              itemName: newName,
              action: "item_renamed",
              summary: { from: pre.name, to: newName },
            });
          } else {
            events.push({
              itemId: update.id,
              itemType: pre.type,
              itemName: pre.name,
              action: "item_updated",
              summary: { fields: changedKeys },
            });
          }
        }
        return events;
      },
    }),
    updateMany: withAuthAndEvents<
      ItemUpdateManyArgs,
      Map<string, { name: string; type: string }>
    >(zeroMutatorSchemas.item.updateMany, sharedMutators.item.updateMany, {
      getItemIds: (args) => [
        ...(args.deletedIds ?? []),
        ...(args.addedItems ?? []).map((item) => item.id),
      ],
      capturePre: async (args, tx) => {
        const deletedIds = args.deletedIds ?? [];
        if (deletedIds.length === 0) return new Map();
        const rows = await tx
          .select({
            itemId: workspaceItems.itemId,
            name: workspaceItems.name,
            type: workspaceItems.type,
          })
          .from(workspaceItems)
          .where(
            and(
              eq(workspaceItems.workspaceId, args.workspaceId),
              inArray(workspaceItems.itemId, deletedIds),
            ),
          );
        return new Map(rows.map((r) => [r.itemId, r]));
      },
      emitEvents: (args, deletedItemMap) => {
        const events: EventInput[] = [];
        for (const id of args.deletedIds ?? []) {
          const pre = deletedItemMap.get(id);
          if (!pre) continue;
          events.push({
            itemId: id,
            itemType: pre.type,
            itemName: pre.name,
            action: "item_deleted",
            summary: { itemType: pre.type },
          });
        }
        for (const item of args.addedItems ?? []) {
          events.push({
            itemId: item.id,
            itemType: item.type,
            itemName: item.name,
            action: "item_created",
            summary: { itemType: item.type },
          });
        }
        return events;
      },
    }),
    move: withAuthAndEvents<ItemMoveArgs, MovePre>(
      zeroMutatorSchemas.item.move,
      sharedMutators.item.move,
      {
        capturePre: async (args, tx) => {
          const [shell] = await tx
            .select({
              name: workspaceItems.name,
              type: workspaceItems.type,
              folderId: workspaceItems.folderId,
            })
            .from(workspaceItems)
            .where(
              and(
                eq(workspaceItems.workspaceId, args.workspaceId),
                eq(workspaceItems.itemId, args.itemId),
              ),
            )
            .limit(1);
          if (!shell) {
            return { item: null, fromFolderName: null, toFolderName: null };
          }
          const fromFolderName = await loadFolderName(
            tx,
            args.workspaceId,
            shell.folderId,
          );
          const toFolderName = await loadFolderName(
            tx,
            args.workspaceId,
            args.folderId,
          );
          return { item: shell, fromFolderName, toFolderName };
        },
        emitEvents: (args, pre) => {
          if (!pre.item) return [];
          return [
            {
              itemId: args.itemId,
              itemType: pre.item.type,
              itemName: pre.item.name,
              action: "item_moved",
              summary: {
                fromFolderId: pre.item.folderId,
                fromFolderName: pre.fromFolderName,
                toFolderId: args.folderId,
                toFolderName: pre.toFolderName,
              },
            },
          ];
        },
      },
    ),
    moveMany: withAuthAndEvents<ItemMoveManyArgs, MoveManyPre>(
      zeroMutatorSchemas.item.moveMany,
      sharedMutators.item.moveMany,
      {
        capturePre: async (args, tx) => {
          if (args.itemIds.length === 0) {
            return {
              items: new Map(),
              folderNames: new Map(),
              toFolderName: null,
            };
          }
          const rows = await tx
            .select({
              itemId: workspaceItems.itemId,
              name: workspaceItems.name,
              type: workspaceItems.type,
              folderId: workspaceItems.folderId,
            })
            .from(workspaceItems)
            .where(
              and(
                eq(workspaceItems.workspaceId, args.workspaceId),
                inArray(workspaceItems.itemId, args.itemIds),
              ),
            );
          const items = new Map<string, ItemNameTypeFolder>(
            rows.map((r) => [r.itemId, r]),
          );

          const folderIdsToLookup = new Set<string>();
          for (const row of rows) {
            if (row.folderId) folderIdsToLookup.add(row.folderId);
          }
          if (args.folderId) folderIdsToLookup.add(args.folderId);

          const folderNames = new Map<string, string>();
          if (folderIdsToLookup.size > 0) {
            const folderRows = await tx
              .select({
                itemId: workspaceItems.itemId,
                name: workspaceItems.name,
              })
              .from(workspaceItems)
              .where(
                and(
                  eq(workspaceItems.workspaceId, args.workspaceId),
                  inArray(workspaceItems.itemId, [...folderIdsToLookup]),
                ),
              );
            for (const f of folderRows) {
              folderNames.set(f.itemId, f.name);
            }
          }

          return {
            items,
            folderNames,
            toFolderName: args.folderId
              ? (folderNames.get(args.folderId) ?? null)
              : null,
          };
        },
        emitEvents: (args, pre) => {
          const events: EventInput[] = [];
          for (const id of args.itemIds) {
            const item = pre.items.get(id);
            if (!item) continue;
            const fromFolderName = item.folderId
              ? (pre.folderNames.get(item.folderId) ?? null)
              : null;
            events.push({
              itemId: id,
              itemType: item.type,
              itemName: item.name,
              action: "item_moved",
              summary: {
                fromFolderId: item.folderId,
                fromFolderName,
                toFolderId: args.folderId,
                toFolderName: pre.toFolderName,
              },
            });
          }
          return events;
        },
      },
    ),
  },
  folder: {
    createWithItems: withAuthAndEvents(
      zeroMutatorSchemas.folder.createWithItems,
      sharedMutators.folder.createWithItems,
      {
        getItemIds: (args) => [args.folder.id, ...args.itemIds],
        emitEvents: (args) => [
          {
            itemId: args.folder.id,
            itemType: "folder",
            itemName: args.folder.name,
            action: "folder_created",
            summary: { initialItemCount: args.itemIds.length },
          },
        ],
      },
    ),
  },
});

// Re-export for tests / future mutator wiring.
export type { WorkspaceEventAction };
