import { createEvent } from "@/lib/workspace/events";
import { appendWorkspaceEventOrThrow } from "@/lib/workspace/workspace-event-store";
import { db, workspaceItemExtracted } from "@/lib/db/client";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import type { OcrItemResult } from "@/lib/ocr/types";
import type { ImageData, Item, PdfData } from "@/lib/workspace-state/types";

export async function persistOcrResults(
  workspaceId: string,
  userId: string,
  results: OcrItemResult[],
): Promise<void> {
  "use step";

  for (const result of results) {
    const ocrPages = result.ok ? result.pages : [];
    const ocrText = getOcrPagesTextContent(ocrPages) || null;

    await db
      .insert(workspaceItemExtracted)
      .values({
        workspaceId,
        itemId: result.itemId,
        searchText: ocrText ?? "",
        ocrText,
        ocrPages: ocrPages as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
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
          updatedAt: new Date().toISOString(),
        },
      });
  }

  const event = createEvent(
    "BULK_ITEMS_PATCHED",
    {
      updates: results.map((result) => {
        const statusPatch = (
          result.ok
            ? {
                ocrStatus: "complete" as const,
                ocrError: undefined,
              }
            : {
                ocrStatus: "failed" as const,
                ocrError: result.error,
              }
        ) satisfies Partial<PdfData> | Partial<ImageData>;

        return {
          id: result.itemId,
          changes: {
            data: statusPatch as Item["data"],
          },
        };
      }),
    },
    userId,
  );

  await appendWorkspaceEventOrThrow({
    workspaceId,
    event,
    conflictMessage: `Version conflict appending event ${event.id} to workspace ${workspaceId}. Workflow will retry automatically.`,
  });
}
