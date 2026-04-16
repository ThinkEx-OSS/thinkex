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
  "website",
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

const jsonValueSchema = z.custom<JsonValue>(isJsonValue);
const jsonObjectSchema = z.custom<JsonObject>(isJsonObject);

const itemSchema = z.object({
  id: z.string(),
  type: cardTypeSchema,
  name: z.string(),
  subtitle: z.string().default(""),
  data: jsonObjectSchema,
  color: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
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
    }),
    moveMany: z.object({
      workspaceId: z.string().uuid(),
      itemIds: z.array(z.string()),
      folderId: z.string().nullable(),
      itemNames: z.array(z.string()).optional(),
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
  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item: params.item,
    sourceVersion: params.sourceVersion ?? 0,
  });

  await tx.mutate.workspace_items.insert(toMutateShellRow(rows.item));
  await tx.mutate.workspace_item_content.insert(
    toMutateContentRow(rows.content),
  );
}

async function upsertItem(
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

  await tx.mutate.workspace_items.update(toMutateShellRow(rows.item));
  await tx.mutate.workspace_item_content.upsert(
    toMutateContentRow(rows.content),
  );
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

    for (const child of children) {
      const loadedChild = await loadItem(tx, {
        workspaceId: params.workspaceId,
        itemId: child.itemId,
      });

      if (!loadedChild) {
        continue;
      }

      await upsertItem(tx, {
        workspaceId: params.workspaceId,
        userId: null,
        sourceVersion: loadedChild.sourceVersion,
        item: {
          ...loadedChild.item,
          folderId: undefined,
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
        const item = toItem({
          ...args.item,
          id: args.id,
          lastModified: now,
        });

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

        for (const rawItem of args.items) {
          await insertItem(tx, {
            workspaceId: args.workspaceId,
            item: toItem({
              ...rawItem,
              lastModified: now,
            }),
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

          for (const rawItem of args.addedItems) {
            await insertItem(tx, {
              workspaceId: args.workspaceId,
              item: toItem({
                ...rawItem,
                lastModified: now,
              }),
              userId: ctx.userId,
              sourceVersion: 0,
            });
          }
        }

        if (args.layoutUpdates?.length) {
          const now = Date.now();

          for (const layoutUpdate of args.layoutUpdates) {
            const existing = await loadItem(tx, {
              workspaceId: args.workspaceId,
              itemId: layoutUpdate.id,
            });

            if (!existing) {
              throw new ApplicationError(
                `Workspace item ${layoutUpdate.id} was not found.`,
              );
            }

            await upsertItem(tx, {
              workspaceId: args.workspaceId,
              userId: ctx.userId,
              sourceVersion: existing.sourceVersion,
              item: {
                ...existing.item,
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
    move: defineMutator(
      zeroMutatorSchemas.item.move,
      async ({ tx, ctx, args }) => {
        const existing = await loadItem(tx, {
          workspaceId: args.workspaceId,
          itemId: args.itemId,
        });

        if (!existing) {
          throw new ApplicationError(
            `Workspace item ${args.itemId} was not found.`,
          );
        }

        await upsertItem(tx, {
          workspaceId: args.workspaceId,
          userId: ctx.userId,
          sourceVersion: existing.sourceVersion,
          item: {
            ...existing.item,
            folderId: args.folderId ?? undefined,
            layout: undefined,
            lastModified: Date.now(),
          },
        });
      },
    ),
    moveMany: defineMutator(
      zeroMutatorSchemas.item.moveMany,
      async ({ tx, ctx, args }) => {
        const now = Date.now();

        for (const itemId of args.itemIds) {
          const existing = await loadItem(tx, {
            workspaceId: args.workspaceId,
            itemId,
          });

          if (!existing) {
            throw new ApplicationError(
              `Workspace item ${itemId} was not found.`,
            );
          }

          await upsertItem(tx, {
            workspaceId: args.workspaceId,
            userId: ctx.userId,
            sourceVersion: existing.sourceVersion,
            item: {
              ...existing.item,
              folderId: args.folderId ?? undefined,
              layout: undefined,
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

        await insertItem(tx, {
          workspaceId: args.workspaceId,
          item: toItem({
            ...args.folder,
            lastModified: now,
          }),
          userId: ctx.userId,
          sourceVersion: 0,
        });

        for (const itemId of args.itemIds) {
          const existing = await loadItem(tx, {
            workspaceId: args.workspaceId,
            itemId,
          });

          if (!existing) {
            throw new ApplicationError(
              `Workspace item ${itemId} was not found.`,
            );
          }

          await upsertItem(tx, {
            workspaceId: args.workspaceId,
            userId: ctx.userId,
            sourceVersion: existing.sourceVersion,
            item: {
              ...existing.item,
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
