import {
  ApplicationError,
  type Transaction,
  defineMutatorWithType,
  defineMutatorsWithType,
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
import type { ZeroContext } from "./client";

const defineZeroMutator = defineMutatorWithType<typeof schema, ZeroContext>();
const defineZeroMutators = defineMutatorsWithType<typeof schema>();
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

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema: z.ZodType<{ [key: string]: JsonValue }> = z.record(
  z.string(),
  jsonValueSchema,
);

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

export const mutators = defineZeroMutators({
  item: {
    create: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.create.parse(args);
      const now = Date.now();
      const item = toItem({
        ...parsed.item,
        id: parsed.id,
        lastModified: now,
      });

      await insertItem(tx, {
        workspaceId: parsed.workspaceId,
        item,
        userId: ctx.userId,
        sourceVersion: 0,
      });
    }),
    update: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.update.parse(args);
      const existing = await loadItem(tx, {
        workspaceId: parsed.workspaceId,
        itemId: parsed.id,
      });

      if (!existing) {
        throw new ApplicationError(
          `Workspace item ${parsed.id} was not found.`,
        );
      }

      const next = mergeItemChanges(existing.item, parsed.changes, Date.now());

      await upsertItem(tx, {
        workspaceId: parsed.workspaceId,
        item: next,
        sourceVersion: existing.sourceVersion,
        userId: ctx.userId,
      });
    }),
    delete: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.delete.parse(args);
      await deleteItemById(tx, {
        workspaceId: parsed.workspaceId,
        itemId: parsed.id,
      });
    }),
    createMany: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.createMany.parse(args);
      const now = Date.now();

      for (const rawItem of parsed.items) {
        await insertItem(tx, {
          workspaceId: parsed.workspaceId,
          item: toItem({
            ...rawItem,
            lastModified: now,
          }),
          userId: ctx.userId,
          sourceVersion: 0,
        });
      }
    }),
    patchMany: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.patchMany.parse(args);
      const now = Date.now();

      for (const update of parsed.updates) {
        const existing = await loadItem(tx, {
          workspaceId: parsed.workspaceId,
          itemId: update.id,
        });

        if (!existing) {
          throw new ApplicationError(
            `Workspace item ${update.id} was not found.`,
          );
        }

        const next = mergeItemChanges(existing.item, update.changes, now);

        await upsertItem(tx, {
          workspaceId: parsed.workspaceId,
          item: next,
          sourceVersion: existing.sourceVersion,
          userId: ctx.userId,
        });
      }
    }),
    updateMany: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.updateMany.parse(args);
      if (parsed.deletedIds?.length) {
        for (const itemId of parsed.deletedIds) {
          await deleteItemById(tx, {
            workspaceId: parsed.workspaceId,
            itemId,
          });
        }
      }

      if (parsed.addedItems?.length) {
        const now = Date.now();

        for (const rawItem of parsed.addedItems) {
          await insertItem(tx, {
            workspaceId: parsed.workspaceId,
            item: toItem({
              ...rawItem,
              lastModified: now,
            }),
            userId: ctx.userId,
            sourceVersion: 0,
          });
        }
      }

      if (parsed.layoutUpdates?.length) {
        const now = Date.now();

        for (const layoutUpdate of parsed.layoutUpdates) {
          const existing = await loadItem(tx, {
            workspaceId: parsed.workspaceId,
            itemId: layoutUpdate.id,
          });

          if (!existing) {
            throw new ApplicationError(
              `Workspace item ${layoutUpdate.id} was not found.`,
            );
          }

          await upsertItem(tx, {
            workspaceId: parsed.workspaceId,
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
    }),
    move: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.move.parse(args);
      const existing = await loadItem(tx, {
        workspaceId: parsed.workspaceId,
        itemId: parsed.itemId,
      });

      if (!existing) {
        throw new ApplicationError(
          `Workspace item ${parsed.itemId} was not found.`,
        );
      }

      await upsertItem(tx, {
        workspaceId: parsed.workspaceId,
        userId: ctx.userId,
        sourceVersion: existing.sourceVersion,
        item: {
          ...existing.item,
          folderId: parsed.folderId ?? undefined,
          layout: undefined,
          lastModified: Date.now(),
        },
      });
    }),
    moveMany: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.item.moveMany.parse(args);
      const now = Date.now();

      for (const itemId of parsed.itemIds) {
        const existing = await loadItem(tx, {
          workspaceId: parsed.workspaceId,
          itemId,
        });

        if (!existing) {
          throw new ApplicationError(`Workspace item ${itemId} was not found.`);
        }

        await upsertItem(tx, {
          workspaceId: parsed.workspaceId,
          userId: ctx.userId,
          sourceVersion: existing.sourceVersion,
          item: {
            ...existing.item,
            folderId: parsed.folderId ?? undefined,
            layout: undefined,
            lastModified: now,
          },
        });
      }
    }),
  },
  folder: {
    createWithItems: defineZeroMutator(async ({ tx, ctx, args }) => {
      const parsed = zeroMutatorSchemas.folder.createWithItems.parse(args);
      const now = Date.now();

      await insertItem(tx, {
        workspaceId: parsed.workspaceId,
        item: toItem({
          ...parsed.folder,
          lastModified: now,
        }),
        userId: ctx.userId,
        sourceVersion: 0,
      });

      for (const itemId of parsed.itemIds) {
        const existing = await loadItem(tx, {
          workspaceId: parsed.workspaceId,
          itemId,
        });

        if (!existing) {
          throw new ApplicationError(`Workspace item ${itemId} was not found.`);
        }

        await upsertItem(tx, {
          workspaceId: parsed.workspaceId,
          userId: ctx.userId,
          sourceVersion: existing.sourceVersion,
          item: {
            ...existing.item,
            folderId: parsed.folder.id,
            layout: undefined,
            lastModified: now,
          },
        });
      }
    }),
  },
});
