import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
} from "@/lib/db/client";
import {
  rehydrateWorkspaceItem,
  type WorkspaceItemExtractedProjection,
} from "./workspace-item-model";
import type { Item } from "@/lib/workspace-state/types";

type DbTransaction = Parameters<(typeof db)["transaction"]>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never;
type DbExecutor = typeof db | DbTransaction;

async function readWorkspaceState(
  tx: DbExecutor,
  workspaceId: string,
): Promise<Item[]> {
  const shellRows = await tx
    .select()
    .from(workspaceItems)
    .where(eq(workspaceItems.workspaceId, workspaceId))
    .orderBy(asc(workspaceItems.createdAt), asc(workspaceItems.itemId));

  if (shellRows.length === 0) {
    return [];
  }

  const itemIds = shellRows.map(
    (row: typeof workspaceItems.$inferSelect) => row.itemId,
  );
  const [contentRows, extractedRows] = await Promise.all([
    tx
      .select()
      .from(workspaceItemContent)
      .where(
        and(
          eq(workspaceItemContent.workspaceId, workspaceId),
          inArray(workspaceItemContent.itemId, itemIds),
        ),
      ),
    tx
      .select()
      .from(workspaceItemExtracted)
      .where(
        and(
          eq(workspaceItemExtracted.workspaceId, workspaceId),
          inArray(workspaceItemExtracted.itemId, itemIds),
        ),
      ),
  ]);

  const contentByItemId = new Map(
    contentRows.map((row: typeof workspaceItemContent.$inferSelect) => [
      row.itemId,
      row,
    ]),
  );
  const extractedByItemId = new Map(
    extractedRows.map((row: typeof workspaceItemExtracted.$inferSelect) => [
      row.itemId,
      row,
    ]),
  );

  return shellRows.map((shell: typeof workspaceItems.$inferSelect) => {
    const content = contentByItemId.get(shell.itemId) as
      | typeof workspaceItemContent.$inferSelect
      | undefined;
    const extracted = extractedByItemId.get(shell.itemId) as
      | typeof workspaceItemExtracted.$inferSelect
      | undefined;

    return rehydrateWorkspaceItem({
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
            ocrPages:
              (extracted.ocrPages as WorkspaceItemExtractedProjection["ocrPages"]) ??
              null,
            transcriptSegments:
              (extracted.transcriptSegments as WorkspaceItemExtractedProjection["transcriptSegments"]) ??
              null,
          }
        : null,
    });
  });
}

export async function loadWorkspaceState(
  workspaceId: string,
  _options?: { userId?: string | null },
): Promise<Item[]> {
  return db.transaction((tx) => readWorkspaceState(tx, workspaceId));
}
