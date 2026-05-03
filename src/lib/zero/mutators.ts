import {
  ApplicationError,
  type Transaction,
  defineMutator,
  defineMutators,
} from "@rocicorp/zero";
import { z } from "zod";
import type { Item } from "@/lib/workspace-state/types";
import {
  buildWorkspaceItemTableRows,
  rehydrateWorkspaceItem,
} from "@/lib/workspace/workspace-item-model";
import {
  sanitizeWorkspaceItemChanges,
  sanitizeWorkspaceItemForPersistence,
} from "@/lib/workspace/workspace-item-sanitize";
import {
  getWorkspaceItemLane,
  sortWorkspaceItemsByOrder,
} from "@/lib/workspace-state/order";
import { schema, zql } from "./zero-schema.gen";

type ZeroTx = Transaction<typeof schema>;

const cardTypeSchema = z.enum([
  "pdf",
  "flashcard",
  "folder",
  "youtube",
  "quiz",
  "image",
  "audio",
  "document",
]);

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }

  return false;
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value)
  );
}

const jsonObjectSchema = z.custom<JsonObject>(isJsonObject);
const sortOrderSchema = z.number().int().min(0);

const itemSchema = z.object({
  id: z.string(),
  type: cardTypeSchema,
  name: z.string(),
  subtitle: z.string().default(""),
  data: jsonObjectSchema,
  color: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  sortOrder: sortOrderSchema.nullable().optional(),
  layout: jsonObjectSchema.nullable().optional(),
  lastModified: z.number().int().optional(),
});

const folderItemSchema = itemSchema.extend({
  type: z.literal("folder"),
});

const itemChangesSchema = z.object({
  name: z.string().optional(),
  subtitle: z.string().optional(),
  data: jsonObjectSchema.optional(),
  color: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  sortOrder: sortOrderSchema.nullable().optional(),
  layout: jsonObjectSchema.nullable().optional(),
  lastModified: z.number().int().optional(),
});

const layoutUpdateSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

export const zeroMutatorSchemas = {
  item: {
    create: z.object({
      workspaceId: z.string().uuid(),
      id: z.string(),
      item: itemSchema,
    }),
    update: z.object({
      workspaceId: z.string().uuid(),
      id: z.string(),
      changes: itemChangesSchema,
      name: z.string().optional(),
    }),
    delete: z.object({
      workspaceId: z.string().uuid(),
      id: z.string(),
      name: z.string().optional(),
    }),
    createMany: z.object({
      workspaceId: z.string().uuid(),
      items: z.array(itemSchema),
    }),
    patchMany: z.object({
      workspaceId: z.string().uuid(),
      updates: z.array(
        z.object({
          id: z.string(),
          changes: itemChangesSchema,
          name: z.string().optional(),
        }),
      ),
    }),
    updateMany: z.object({
      workspaceId: z.string().uuid(),
      layoutUpdates: z.array(layoutUpdateSchema).optional(),
      previousItemCount: z.number().int().optional(),
      deletedIds: z.array(z.string()).optional(),
      addedItems: z.array(itemSchema).optional(),
    }),
    move: z.object({
      workspaceId: z.string().uuid(),
      itemId: z.string(),
      folderId: z.string().nullable(),
      itemName: z.string().optional(),
      sortOrder: sortOrderSchema.optional(),
    }),
    moveMany: z.object({
      workspaceId: z.string().uuid(),
      itemIds: z.array(z.string()),
      folderId: z.string().nullable(),
      itemNames: z.array(z.string()).optional(),
      sortOrders: z
        .array(
          z.object({
            itemId: z.string(),
            sortOrder: sortOrderSchema,
          }),
        )
        .optional(),
    }),
    reorder: z.object({
      workspaceId: z.string().uuid(),
      updates: z.array(
        z.object({
          itemId: z.string(),
          sortOrder: sortOrderSchema,
        }),
      ),
    }),
  },
  folder: {
    createWithItems: z.object({
      workspaceId: z.string().uuid(),
      folder: folderItemSchema,
      itemIds: z.array(z.string()),
    }),
  },
} as const;

function toItem(input: z.infer<typeof itemSchema>): Item {
  return sanitizeWorkspaceItemForPersistence({
    id: input.id,
    type: input.type,
    name: input.name,
    subtitle: input.subtitle,
    data: input.data as Item["data"],
    ...(input.color !== undefined
      ? { color: (input.color ?? undefined) as Item["color"] }
      : {}),
    ...(input.folderId !== undefined
      ? { folderId: input.folderId ?? undefined }
      : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(input.layout !== undefined
      ? { layout: input.layout ?? undefined }
      : {}),
    ...(input.lastModified !== undefined
      ? { lastModified: input.lastModified }
      : {}),
  });
}

function mergeItemChanges(
  existing: Item,
  changes: z.infer<typeof itemChangesSchema>,
  lastModified: number,
): Item {
  const sanitizedChanges = sanitizeWorkspaceItemChanges(
    changes as Partial<Item>,
  ) as z.infer<typeof itemChangesSchema>;
  const next: Item = {
    ...existing,
    ...(sanitizedChanges.name !== undefined
      ? { name: sanitizedChanges.name }
      : {}),
    ...(sanitizedChanges.subtitle !== undefined
      ? { subtitle: sanitizedChanges.subtitle }
      : {}),
    ...(sanitizedChanges.color !== undefined
      ? { color: (sanitizedChanges.color ?? undefined) as Item["color"] }
      : {}),
    ...(sanitizedChanges.folderId !== undefined
      ? { folderId: sanitizedChanges.folderId ?? undefined }
      : {}),
    ...(sanitizedChanges.sortOrder !== undefined
      ? { sortOrder: sanitizedChanges.sortOrder }
      : {}),
    ...(sanitizedChanges.layout !== undefined
      ? { layout: sanitizedChanges.layout ?? undefined }
      : {}),
    ...(sanitizedChanges.lastModified !== undefined
      ? { lastModified: sanitizedChanges.lastModified }
      : { lastModified }),
    data:
      sanitizedChanges.data !== undefined
        ? ({
            ...(existing.data as Record<string, unknown>),
            ...sanitizedChanges.data,
          } as Item["data"])
        : existing.data,
  };

  return sanitizeWorkspaceItemForPersistence(next);
}

function toMutateShellRow(
  row: ReturnType<typeof buildWorkspaceItemTableRows>["item"],
) {
  return {
    ...row,
    layout: (row.layout ?? undefined) as JsonValue | undefined,
  };
}

function toMutateContentRow(
  row: ReturnType<typeof buildWorkspaceItemTableRows>["content"],
) {
  return {
    ...row,
    structuredData: (row.structuredData ?? undefined) as JsonValue | undefined,
    assetData: (row.assetData ?? undefined) as JsonValue | undefined,
    embedData: (row.embedData ?? undefined) as JsonValue | undefined,
    sourceData: (row.sourceData ?? undefined) as JsonValue | undefined,
  };
}

async function loadWorkspaceShells(
  tx: ZeroTx,
  workspaceId: string,
): Promise<Item[]> {
  const shells =
    (await tx.run(zql.workspace_items.where("workspaceId", workspaceId))) ?? [];

  return shells.map((shell) =>
    rehydrateWorkspaceItem({
      shell: {
        itemId: shell.itemId,
        type: shell.type as Item["type"],
        name: shell.name,
        subtitle: shell.subtitle,
        color: (shell.color as Item["color"]) ?? null,
        folderId: shell.folderId ?? null,
        sortOrder: shell.sortOrder ?? null,
        layout: (shell.layout as Item["layout"] | undefined) ?? null,
        lastModified: shell.lastModified ?? null,
        ocrStatus: shell.ocrStatus ?? null,
        processingStatus: shell.processingStatus ?? null,
      },
    }),
  );
}

function getNextSortOrderForItem(
  items: Item[],
  item: Pick<Item, "type" | "folderId">,
) {
  const siblings = items.filter(
    (candidate) =>
      getWorkspaceItemLane(candidate) === getWorkspaceItemLane(item) &&
      (candidate.folderId ?? null) === (item.folderId ?? null),
  );
  const maxSortOrder = siblings.reduce<number>(
    (max, candidate) =>
      candidate.sortOrder == null ? max : Math.max(max, candidate.sortOrder),
    -1,
  );

  return Math.max(maxSortOrder + 1, siblings.length);
}

function withAssignedSortOrder(item: Item, items: Item[]): Item {
  if (item.sortOrder != null) {
    return item;
  }

  return {
    ...item,
    sortOrder: getNextSortOrderForItem(items, item),
  };
}

async function loadItem(
  tx: ZeroTx,
  params: { workspaceId: string; itemId: string },
): Promise<{
  item: Item;
  sourceVersion: number;
} | null> {
  const shell = await tx.run(
    zql.workspace_items
      .where("workspaceId", params.workspaceId)
      .where("itemId", params.itemId)
      .one(),
  );

  if (!shell) {
    return null;
  }

  const content = await tx.run(
    zql.workspace_item_content
      .where("workspaceId", params.workspaceId)
      .where("itemId", params.itemId)
      .one(),
  );

  return {
    item: rehydrateWorkspaceItem({
      shell: {
        itemId: shell.itemId,
        type: shell.type as Item["type"],
        name: shell.name,
        subtitle: shell.subtitle,
        color: (shell.color as Item["color"]) ?? null,
        folderId: shell.folderId ?? null,
        sortOrder: shell.sortOrder ?? null,
        layout: (shell.layout as Item["layout"] | undefined) ?? null,
        lastModified: shell.lastModified ?? null,
        ocrStatus: shell.ocrStatus ?? null,
        processingStatus: shell.processingStatus ?? null,
      },
      content: content
        ? {
            textContent: content.textContent ?? null,
            structuredData:
              (content.structuredData as Record<string, unknown> | null) ??
              null,
            assetData:
              (content.assetData as Record<string, unknown> | null) ?? null,
            embedData:
              (content.embedData as Record<string, unknown> | null) ?? null,
            sourceData: (content.sourceData as never[] | null) ?? null,
          }
        : null,
    }),
    sourceVersion: shell.sourceVersion,
  };
}

async function insertItem(
  tx: ZeroTx,
  params: {
    workspaceId: string;
    item: Item;
    sourceVersion?: number;
    userId: string | null;
  },
) {
  const item =
    params.item.sortOrder != null
      ? params.item
      : withAssignedSortOrder(
          params.item,
          await loadWorkspaceShells(tx, params.workspaceId),
        );
  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item,
    sourceVersion: params.sourceVersion ?? 0,
  });

  await tx.mutate.workspace_items.insert(toMutateShellRow(rows.item));
  await tx.mutate.workspace_item_content.insert(
    toMutateContentRow(rows.content),
  );
}

export async function upsertItem(
  tx: ZeroTx,
  params: {
    workspaceId: string;
    item: Item;
    sourceVersion: number;
    userId: string | null;
  },
) {
  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item: params.item,
    sourceVersion: params.sourceVersion,
  });

  const fullShell = toMutateShellRow(rows.item);
  // Strip workflow-owned / extracted-derived shell fields from the shared
  // mutator payload. The Zero client can't see `workspace_item_extracted`, so
  // `splitWorkspaceItem` computes `hasOcr` / `ocrPageCount` / `hasTranscript` /
  // `contentHash` from truncated data and would clobber the real values.
  // `ocrStatus` is workflow-owned (written only by `persistOcrResults` and
  // `workspace-worker` direct-DB paths, plus initial `insertItem` on upload).
  // A concurrent user edit whose mutator tx snapshots a pre-completion
  // `"processing"` value before the workflow commits `"complete"` would
  // otherwise overwrite the workflow's write when the mutator upserts the
  // shell. `processingStatus` is intentionally *not* stripped here because
  // the audio retry flow (WorkspaceContent.tsx handleAudioComplete) goes
  // through this path to flip audio back to `"processing"` after a user
  // hits retry; stripping it would lose that state transition.
  // `syncExtractedRow` rebuilds all derived fields server-side from the
  // real extracted row.
  const {
    hasOcr: _hasOcr,
    ocrPageCount: _ocrPageCount,
    hasTranscript: _hasTranscript,
    contentHash: _contentHash,
    ocrStatus: _ocrStatus,
    ...clientSafeShell
  } = fullShell;

  await tx.mutate.workspace_items.update(
    clientSafeShell as Parameters<typeof tx.mutate.workspace_items.update>[0],
  );
  await tx.mutate.workspace_item_content.upsert(
    toMutateContentRow(rows.content),
  );
}

async function updateShellOnly(
  tx: ZeroTx,
  params: {
    workspaceId: string;
    itemId: string;
    shellChanges: Partial<{
      layout: Item["layout"];
      folderId: string | undefined;
      sortOrder: number | null;
      lastModified: number;
    }>;
  },
) {
  await tx.mutate.workspace_items.update({
    workspaceId: params.workspaceId,
    itemId: params.itemId,
    ...("layout" in params.shellChanges
      ? { layout: params.shellChanges.layout ?? null }
      : {}),
    ...("folderId" in params.shellChanges
      ? { folderId: params.shellChanges.folderId ?? null }
      : {}),
    ...("sortOrder" in params.shellChanges
      ? { sortOrder: params.shellChanges.sortOrder }
      : {}),
    ...(params.shellChanges.lastModified !== undefined
      ? { lastModified: params.shellChanges.lastModified }
      : {}),
  } as Parameters<typeof tx.mutate.workspace_items.update>[0]);
}

async function deleteItemById(
  tx: ZeroTx,
  params: {
    workspaceId: string;
    itemId: string;
  },
) {
  const shell = await tx.run(
    zql.workspace_items
      .where("workspaceId", params.workspaceId)
      .where("itemId", params.itemId)
      .one(),
  );

  if (!shell) {
    return;
  }

  await tx.mutate.workspace_item_content.delete({
    workspaceId: params.workspaceId,
    itemId: params.itemId,
  });
  await tx.mutate.workspace_items.delete({
    workspaceId: params.workspaceId,
    itemId: params.itemId,
  });

  if (shell.type === "folder") {
    const children = await tx.run(
      zql.workspace_items
        .where("workspaceId", params.workspaceId)
        .where("folderId", params.itemId),
    );
    const now = Date.now();
    const allItems = sortWorkspaceItemsByOrder(
      await loadWorkspaceShells(tx, params.workspaceId),
    );

    const orderedChildren = sortWorkspaceItemsByOrder(
      children
        .map((child) => allItems.find((item) => item.id === child.itemId) ?? null)
        .filter((item): item is Item => item != null),
    );

    for (const childItem of orderedChildren) {
      const sortOrder = getNextSortOrderForItem(allItems, {
        type: childItem.type,
        folderId: undefined,
      });

      allItems.push({
        ...childItem,
        folderId: undefined,
        sortOrder,
      });

      await updateShellOnly(tx, {
        workspaceId: params.workspaceId,
        itemId: childItem.id,
        shellChanges: {
          folderId: undefined,
          sortOrder,
          layout: undefined,
          lastModified: now,
        },
      });
    }
  }
}

export const mutators = defineMutators({
  item: {
    create: defineMutator(
      zeroMutatorSchemas.item.create,
      async ({ tx, ctx, args }) => {
        const now = Date.now();
        const existingItems = await loadWorkspaceShells(tx, args.workspaceId);
        const item = withAssignedSortOrder(
          toItem({
            ...args.item,
            id: args.id,
            lastModified: now,
          }),
          existingItems,
        );

        await insertItem(tx, {
          workspaceId: args.workspaceId,
          item,
          userId: ctx.userId,
          sourceVersion: 0,
        });
      },
    ),
    update: defineMutator(
      zeroMutatorSchemas.item.update,
      async ({ tx, ctx, args }) => {
        const existing = await loadItem(tx, {
          workspaceId: args.workspaceId,
          itemId: args.id,
        });

        if (!existing) {
          throw new ApplicationError(
            `Workspace item ${args.id} was not found.`,
          );
        }

        const next = mergeItemChanges(existing.item, args.changes, Date.now());

        await upsertItem(tx, {
          workspaceId: args.workspaceId,
          item: next,
          sourceVersion: existing.sourceVersion,
          userId: ctx.userId,
        });
      },
    ),
    delete: defineMutator(
      zeroMutatorSchemas.item.delete,
      async ({ tx, ctx, args }) => {
        await deleteItemById(tx, {
          workspaceId: args.workspaceId,
          itemId: args.id,
        });
      },
    ),
    createMany: defineMutator(
      zeroMutatorSchemas.item.createMany,
      async ({ tx, ctx, args }) => {
        const now = Date.now();
        const allItems = await loadWorkspaceShells(tx, args.workspaceId);

        for (const rawItem of args.items) {
          const item = withAssignedSortOrder(
            toItem({
              ...rawItem,
              lastModified: now,
            }),
            allItems,
          );

          allItems.push(item);
          await insertItem(tx, {
            workspaceId: args.workspaceId,
            item,
            userId: ctx.userId,
            sourceVersion: 0,
          });
        }
      },
    ),
    patchMany: defineMutator(
      zeroMutatorSchemas.item.patchMany,
      async ({ tx, ctx, args }) => {
        const now = Date.now();

        for (const update of args.updates) {
          const existing = await loadItem(tx, {
            workspaceId: args.workspaceId,
            itemId: update.id,
          });

          if (!existing) {
            throw new ApplicationError(
              `Workspace item ${update.id} was not found.`,
            );
          }

          const next = mergeItemChanges(existing.item, update.changes, now);

          await upsertItem(tx, {
            workspaceId: args.workspaceId,
            item: next,
            sourceVersion: existing.sourceVersion,
            userId: ctx.userId,
          });
        }
      },
    ),
    updateMany: defineMutator(
      zeroMutatorSchemas.item.updateMany,
      async ({ tx, ctx, args }) => {
        if (args.deletedIds?.length) {
          for (const itemId of args.deletedIds) {
            await deleteItemById(tx, {
              workspaceId: args.workspaceId,
              itemId,
            });
          }
        }

        if (args.addedItems?.length) {
          const now = Date.now();
          const allItems = await loadWorkspaceShells(tx, args.workspaceId);

          for (const rawItem of args.addedItems) {
            const item = withAssignedSortOrder(
              toItem({
                ...rawItem,
                lastModified: now,
              }),
              allItems,
            );

            allItems.push(item);
            await insertItem(tx, {
              workspaceId: args.workspaceId,
              item,
              userId: ctx.userId,
              sourceVersion: 0,
            });
          }
        }

        if (args.layoutUpdates?.length) {
          const now = Date.now();

          for (const layoutUpdate of args.layoutUpdates) {
            await updateShellOnly(tx, {
              workspaceId: args.workspaceId,
              itemId: layoutUpdate.id,
              shellChanges: {
                layout: {
                  x: layoutUpdate.x,
                  y: layoutUpdate.y,
                  w: layoutUpdate.w,
                  h: layoutUpdate.h,
                },
                lastModified: now,
              },
            });
          }
        }
      },
    ),
    move: defineMutator(zeroMutatorSchemas.item.move, async ({ tx, args }) => {
      if (args.sortOrder !== undefined) {
        await updateShellOnly(tx, {
          workspaceId: args.workspaceId,
          itemId: args.itemId,
          shellChanges: {
            folderId: args.folderId ?? undefined,
            sortOrder: args.sortOrder,
            layout: undefined,
            lastModified: Date.now(),
          },
        });
        return;
      }

      const existing = await loadItem(tx, {
        workspaceId: args.workspaceId,
        itemId: args.itemId,
      });

      if (!existing) {
        await updateShellOnly(tx, {
          workspaceId: args.workspaceId,
          itemId: args.itemId,
          shellChanges: {
            folderId: args.folderId ?? undefined,
            layout: undefined,
            lastModified: Date.now(),
          },
        });
        return;
      }

      const allItems = sortWorkspaceItemsByOrder(
        await loadWorkspaceShells(tx, args.workspaceId),
      );
      const nextSortOrder = getNextSortOrderForItem(allItems, {
        type: existing.item.type,
        folderId: args.folderId ?? undefined,
      });

      await updateShellOnly(tx, {
        workspaceId: args.workspaceId,
        itemId: args.itemId,
        shellChanges: {
          folderId: args.folderId ?? undefined,
          sortOrder: nextSortOrder,
          layout: undefined,
          lastModified: Date.now(),
        },
      });
    }),
    moveMany: defineMutator(
      zeroMutatorSchemas.item.moveMany,
      async ({ tx, args }) => {
        if (args.sortOrders?.length) {
          const sortOrdersById = new Map(
            args.sortOrders.map((entry) => [entry.itemId, entry.sortOrder]),
          );
          const now = Date.now();

          for (const itemId of args.itemIds) {
            const sortOrder = sortOrdersById.get(itemId);

            if (sortOrder === undefined) {
              throw new ApplicationError(
                `Missing sort order for moved item ${itemId}.`,
              );
            }

            await updateShellOnly(tx, {
              workspaceId: args.workspaceId,
              itemId,
              shellChanges: {
                folderId: args.folderId ?? undefined,
                sortOrder,
                layout: undefined,
                lastModified: now,
              },
            });
          }
          return;
        }

        const now = Date.now();
        const allItems = sortWorkspaceItemsByOrder(
          await loadWorkspaceShells(tx, args.workspaceId),
        );
        const movedItems = sortWorkspaceItemsByOrder(
          (
            await Promise.all(
              args.itemIds.map(async (itemId) => {
                const existing = await loadItem(tx, {
                  workspaceId: args.workspaceId,
                  itemId,
                });

                return existing?.item ?? null;
              }),
            )
          ).filter((item): item is Item => item != null),
        );

        for (const item of movedItems) {
          const nextSortOrder = getNextSortOrderForItem(allItems, {
            type: item.type,
            folderId: args.folderId ?? undefined,
          });

          allItems.push({
            ...item,
            folderId: args.folderId ?? undefined,
            sortOrder: nextSortOrder,
          });
          await updateShellOnly(tx, {
            workspaceId: args.workspaceId,
            itemId: item.id,
            shellChanges: {
              folderId: args.folderId ?? undefined,
              sortOrder: nextSortOrder,
              layout: undefined,
              lastModified: now,
            },
          });
        }

        const movedItemIds = new Set(movedItems.map((item) => item.id));

        for (const itemId of args.itemIds) {
          if (movedItemIds.has(itemId)) {
            continue;
          }

          await updateShellOnly(tx, {
            workspaceId: args.workspaceId,
            itemId,
            shellChanges: {
              folderId: args.folderId ?? undefined,
              layout: undefined,
              lastModified: now,
            },
          });
        }
      },
    ),
    reorder: defineMutator(
      zeroMutatorSchemas.item.reorder,
      async ({ tx, args }) => {
        const now = Date.now();
        const updatesByItemId = new Map(
          args.updates.map((update) => [update.itemId, update]),
        );

        if (updatesByItemId.size !== args.updates.length) {
          throw new ApplicationError("Reorder payload contains duplicate items.");
        }

        const allItems = await loadWorkspaceShells(tx, args.workspaceId);
        const updatedItems = args.updates.map((update) => {
          const item = allItems.find((candidate) => candidate.id === update.itemId);
          if (!item) {
            throw new ApplicationError(
              `Workspace item ${update.itemId} was not found.`,
            );
          }
          return item;
        });
        const firstItem = updatedItems[0];

        if (!firstItem) {
          return;
        }

        const lane = getWorkspaceItemLane(firstItem);
        const folderId = firstItem.folderId ?? null;

        if (
          updatedItems.some(
            (item) =>
              getWorkspaceItemLane(item) !== lane ||
              (item.folderId ?? null) !== folderId,
          )
        ) {
          throw new ApplicationError(
            "Reorder payload must contain items from one folder and lane.",
          );
        }

        const siblingItems = allItems.filter(
          (item) =>
            getWorkspaceItemLane(item) === lane &&
            (item.folderId ?? null) === folderId,
        );

        if (siblingItems.length !== args.updates.length) {
          throw new ApplicationError(
            "Reorder payload must include every item in the lane.",
          );
        }

        const sortOrders = args.updates.map((update) => update.sortOrder);
        const uniqueSortOrders = new Set(sortOrders);
        const expectedSortOrders = new Set(
          Array.from({ length: siblingItems.length }, (_, index) => index),
        );

        if (
          uniqueSortOrders.size !== sortOrders.length ||
          sortOrders.some((sortOrder) => !expectedSortOrders.has(sortOrder))
        ) {
          throw new ApplicationError(
            "Reorder payload must use contiguous sort orders starting at zero.",
          );
        }

        for (const update of args.updates) {
          await updateShellOnly(tx, {
            workspaceId: args.workspaceId,
            itemId: update.itemId,
            shellChanges: {
              sortOrder: update.sortOrder,
              lastModified: now,
            },
          });
        }
      },
    ),
  },
  folder: {
    createWithItems: defineMutator(
      zeroMutatorSchemas.folder.createWithItems,
      async ({ tx, ctx, args }) => {
        const now = Date.now();
        const allItems = await loadWorkspaceShells(tx, args.workspaceId);
        const folder = withAssignedSortOrder(
          toItem({
            ...args.folder,
            lastModified: now,
          }),
          allItems,
        );

        allItems.push(folder);
        await insertItem(tx, {
          workspaceId: args.workspaceId,
          item: folder,
          userId: ctx.userId,
          sourceVersion: 0,
        });

        const movedItems = sortWorkspaceItemsByOrder(
          (
            await Promise.all(
              args.itemIds.map(async (itemId) => {
                const existing = await loadItem(tx, {
                  workspaceId: args.workspaceId,
                  itemId,
                });

                return existing?.item ?? null;
              }),
            )
          ).filter((item): item is Item => item != null),
        );

        for (const item of movedItems) {
          const nextSortOrder = getNextSortOrderForItem(allItems, {
            type: item.type,
            folderId: args.folder.id,
          });

          allItems.push({
            ...item,
            folderId: args.folder.id,
            sortOrder: nextSortOrder,
          });
          await updateShellOnly(tx, {
            workspaceId: args.workspaceId,
            itemId: item.id,
            shellChanges: {
              folderId: args.folder.id,
              sortOrder: nextSortOrder,
              layout: undefined,
              lastModified: now,
            },
          });
        }

        const movedItemIds = new Set(movedItems.map((item) => item.id));

        for (const itemId of args.itemIds) {
          if (movedItemIds.has(itemId)) {
            continue;
          }

          await updateShellOnly(tx, {
            workspaceId: args.workspaceId,
            itemId,
            shellChanges: {
              folderId: args.folder.id,
              layout: undefined,
              lastModified: now,
            },
          });
        }
      },
    ),
  },
});
