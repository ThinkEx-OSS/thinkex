import {
  db,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
} from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import type { OcrItemResult } from "@/lib/ocr/types";

export async function persistOcrResults(
  workspaceId: string,
  _userId: string,
  results: OcrItemResult[],
): Promise<void> {
  "use step";

  for (const result of results) {
    const ocrPages = result.ok ? result.pages : [];
    const ocrText = getOcrPagesTextContent(ocrPages) || null;
    const updatedAt = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx
        .insert(workspaceItemExtracted)
        .values({
          workspaceId,
          itemId: result.itemId,
          searchText: ocrText ?? "",
          ocrText,
          ocrPages: ocrPages as unknown as Record<string, unknown>,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            workspaceItemExtracted.workspaceId,
            workspaceItemExtracted.itemId,
          ],
          set: {
            ocrText,
            ocrPages: ocrPages as unknown as Record<string, unknown>,
            searchText: ocrText ?? "",
            updatedAt,
          },
        });

      await tx
        .update(workspaceItems)
        .set({
          ocrStatus: result.ok ? "complete" : "failed",
          hasOcr: result.ok && ocrPages.length > 0,
          ocrPageCount: ocrPages.length,
          lastModified: Date.now(),
        })
        .where(
          and(
            eq(workspaceItems.workspaceId, workspaceId),
            eq(workspaceItems.itemId, result.itemId),
          ),
        );

      const [contentRow] = await tx
        .select({
          assetData: workspaceItemContent.assetData,
        })
        .from(workspaceItemContent)
        .where(
          and(
            eq(workspaceItemContent.workspaceId, workspaceId),
            eq(workspaceItemContent.itemId, result.itemId),
          ),
        )
        .limit(1);

      const currentAssetData =
        (contentRow?.assetData as Record<string, unknown> | null) ?? {};
      const nextAssetData = result.ok
        ? (() => {
            const { ocrError: _ocrError, ...rest } = currentAssetData;
            return rest;
          })()
        : {
            ...currentAssetData,
            ocrError: result.error,
          };

      await tx
        .update(workspaceItemContent)
        .set({
          assetData: nextAssetData,
          updatedAt,
        })
        .where(
          and(
            eq(workspaceItemContent.workspaceId, workspaceId),
            eq(workspaceItemContent.itemId, result.itemId),
          ),
        );
    });
  }
}
