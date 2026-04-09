import { createEvent } from "@/lib/workspace/events";
import { appendWorkspaceEventOrThrow } from "@/lib/workspace/workspace-event-store";
import type { OcrItemResult } from "@/lib/ocr/types";
import type { ImageData, Item, PdfData } from "@/lib/workspace-state/types";

export async function persistOcrResults(
  workspaceId: string,
  userId: string,
  results: OcrItemResult[],
): Promise<void> {
  "use step";

  const event = createEvent(
    "BULK_ITEMS_PATCHED",
    {
      updates: results.map((result) => {
        const dataPatch = (
          result.ok
            ? {
                ocrPages: result.pages,
                ocrStatus: "complete" as const,
                ocrError: undefined,
              }
            : {
                ocrPages: [],
                ocrStatus: "failed" as const,
                ocrError: result.error,
              }
        ) satisfies Partial<PdfData> | Partial<ImageData>;

        return {
          id: result.itemId,
          changes: {
            data: dataPatch as Item["data"],
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
