import { and, eq } from "drizzle-orm";
import {
  db,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
} from "@/lib/db/client";
import type { Item } from "@/lib/workspace-state/types";
import {
  buildWorkspaceItemTableRows,
  rehydrateWorkspaceItem,
} from "./workspace-item-model";
import { sanitizeWorkspaceItemForPersistence } from "./workspace-item-sanitize";

type DbExecutor = typeof db | any;

export async function loadWorkspaceItemRecord(
  tx: DbExecutor,
  params: { workspaceId: string; itemId: string },
): Promise<{ item: Item; sourceVersion: number } | null> {
  const [shell] = await tx
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
    return null;
  }

  const [content] = await tx
    .select()
    .from(workspaceItemContent)
    .where(
      and(
        eq(workspaceItemContent.workspaceId, params.workspaceId),
        eq(workspaceItemContent.itemId, params.itemId),
      ),
    )
    .limit(1);

  const [extracted] = await tx
    .select()
    .from(workspaceItemExtracted)
    .where(
      and(
        eq(workspaceItemExtracted.workspaceId, params.workspaceId),
        eq(workspaceItemExtracted.itemId, params.itemId),
      ),
    )
    .limit(1);

  return {
    item: rehydrateWorkspaceItem({
      shell: {
        itemId: shell.itemId,
        type: shell.type as Item["type"],
        name: shell.name,
        subtitle: shell.subtitle,
        color: (shell.color as Item["color"]) ?? null,
        folderId: shell.folderId ?? null,
        layout: (shell.layout as Item["layout"]) ?? null,
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
      extracted: extracted
        ? {
            searchText: extracted.searchText ?? "",
            contentPreview: extracted.contentPreview ?? null,
            ocrText: extracted.ocrText ?? null,
            transcriptText: extracted.transcriptText ?? null,
            ocrPages: (extracted.ocrPages as any) ?? null,
            transcriptSegments: (extracted.transcriptSegments as any) ?? null,
          }
        : null,
    }),
    sourceVersion: shell.sourceVersion,
  };
}

export async function insertWorkspaceItem(
  tx: DbExecutor,
  params: {
    workspaceId: string;
    item: Item;
    sourceVersion?: number;
  },
): Promise<void> {
  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item: sanitizeWorkspaceItemForPersistence(params.item),
    sourceVersion: params.sourceVersion ?? 0,
  });

  await tx.insert(workspaceItems).values(rows.item);
  await tx.insert(workspaceItemContent).values(rows.content);
  await tx
    .insert(workspaceItemExtracted)
    .values(rows.extracted)
    .onConflictDoUpdate({
      target: [
        workspaceItemExtracted.workspaceId,
        workspaceItemExtracted.itemId,
      ],
      set: {
        searchText: rows.extracted.searchText,
        contentPreview: rows.extracted.contentPreview,
        ocrText: rows.extracted.ocrText,
        transcriptText: rows.extracted.transcriptText,
        ocrPages: rows.extracted.ocrPages,
        transcriptSegments: rows.extracted.transcriptSegments,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function upsertWorkspaceItem(
  tx: DbExecutor,
  params: {
    workspaceId: string;
    item: Item;
    sourceVersion: number;
  },
): Promise<void> {
  const rows = buildWorkspaceItemTableRows({
    workspaceId: params.workspaceId,
    item: sanitizeWorkspaceItemForPersistence(params.item),
    sourceVersion: params.sourceVersion,
  });

  await tx
    .update(workspaceItems)
    .set({
      type: rows.item.type,
      name: rows.item.name,
      subtitle: rows.item.subtitle,
      color: rows.item.color,
      folderId: rows.item.folderId,
      layout: rows.item.layout,
      lastModified: rows.item.lastModified,
      sourceVersion: rows.item.sourceVersion,
      dataSchemaVersion: rows.item.dataSchemaVersion,
      contentHash: rows.item.contentHash,
      processingStatus: rows.item.processingStatus,
      hasOcr: rows.item.hasOcr,
      ocrStatus: rows.item.ocrStatus,
      ocrPageCount: rows.item.ocrPageCount,
      hasTranscript: rows.item.hasTranscript,
      sourceCount: rows.item.sourceCount,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        eq(workspaceItems.itemId, rows.item.itemId),
      ),
    );

  await tx
    .insert(workspaceItemContent)
    .values(rows.content)
    .onConflictDoUpdate({
      target: [workspaceItemContent.workspaceId, workspaceItemContent.itemId],
      set: {
        dataSchemaVersion: rows.content.dataSchemaVersion,
        contentHash: rows.content.contentHash,
        textContent: rows.content.textContent,
        structuredData: rows.content.structuredData,
        assetData: rows.content.assetData,
        embedData: rows.content.embedData,
        sourceData: rows.content.sourceData,
        updatedAt: new Date().toISOString(),
      },
    });

  await tx
    .insert(workspaceItemExtracted)
    .values(rows.extracted)
    .onConflictDoUpdate({
      target: [
        workspaceItemExtracted.workspaceId,
        workspaceItemExtracted.itemId,
      ],
      set: {
        searchText: rows.extracted.searchText,
        contentPreview: rows.extracted.contentPreview,
        ocrText: rows.extracted.ocrText,
        transcriptText: rows.extracted.transcriptText,
        ocrPages: rows.extracted.ocrPages,
        transcriptSegments: rows.extracted.transcriptSegments,
        updatedAt: new Date().toISOString(),
      },
    });
}

export async function deleteWorkspaceItemById(
  tx: DbExecutor,
  params: {
    workspaceId: string;
    itemId: string;
  },
): Promise<void> {
  const [shell] = await tx
    .select({
      type: workspaceItems.type,
    })
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        eq(workspaceItems.itemId, params.itemId),
      ),
    )
    .limit(1);

  if (!shell) {
    return;
  }

  await tx
    .delete(workspaceItemExtracted)
    .where(
      and(
        eq(workspaceItemExtracted.workspaceId, params.workspaceId),
        eq(workspaceItemExtracted.itemId, params.itemId),
      ),
    );
  await tx
    .delete(workspaceItemContent)
    .where(
      and(
        eq(workspaceItemContent.workspaceId, params.workspaceId),
        eq(workspaceItemContent.itemId, params.itemId),
      ),
    );
  await tx
    .delete(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        eq(workspaceItems.itemId, params.itemId),
      ),
    );

  if (shell.type !== "folder") {
    return;
  }

  const children = await tx
    .select({
      itemId: workspaceItems.itemId,
    })
    .from(workspaceItems)
    .where(
      and(
        eq(workspaceItems.workspaceId, params.workspaceId),
        eq(workspaceItems.folderId, params.itemId),
      ),
    );

  const now = Date.now();

  for (const child of children) {
    const loadedChild = await loadWorkspaceItemRecord(tx, {
      workspaceId: params.workspaceId,
      itemId: child.itemId,
    });

    if (!loadedChild) {
      continue;
    }

    await upsertWorkspaceItem(tx, {
      workspaceId: params.workspaceId,
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
