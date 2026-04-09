import { createEvent } from "@/lib/workspace/events";
import { appendWorkspaceEventOrThrow } from "@/lib/workspace/workspace-event-store";
import { db, workspaceItemExtracted } from "@/lib/db/client";
import type { AudioData, Item } from "@/lib/workspace-state/types";
import type { TranscribeResult } from "./transcribe";

async function appendAudioEvent(
  workspaceId: string,
  event: ReturnType<typeof createEvent>,
) {
  await appendWorkspaceEventOrThrow({
    workspaceId,
    event,
    conflictMessage: `Version conflict appending event ${event.id} to workspace ${workspaceId}. Workflow will retry automatically.`,
  });
}

export async function persistAudioResult(
  workspaceId: string,
  itemId: string,
  userId: string,
  result: TranscribeResult,
): Promise<void> {
  "use step";

  const transcriptText = result.segments
    ?.map((s) => s.content)
    .join("\n") || null;

  await db
    .insert(workspaceItemExtracted)
    .values({
      workspaceId,
      itemId,
      searchText: transcriptText ?? "",
      transcriptText,
      transcriptSegments: result.segments as unknown as Record<string, unknown>,
      updatedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [
        workspaceItemExtracted.workspaceId,
        workspaceItemExtracted.itemId,
      ],
      set: {
        transcriptText,
        transcriptSegments: result.segments as unknown as Record<string, unknown>,
        searchText: transcriptText ?? "",
        updatedAt: new Date().toISOString(),
      },
    });

  const event = createEvent(
    "ITEM_UPDATED",
    {
      id: itemId,
      changes: {
        data: {
          summary: result.summary,
          ...(typeof result.duration === "number" &&
            result.duration > 0 && { duration: result.duration }),
          processingStatus: "complete" as const,
        } satisfies Partial<AudioData> as Item["data"],
      },
    },
    userId,
  );

  await appendAudioEvent(workspaceId, event);
}

export async function persistAudioFailure(
  workspaceId: string,
  itemId: string,
  userId: string,
  error: string,
): Promise<void> {
  "use step";

  const event = createEvent(
    "ITEM_UPDATED",
    {
      id: itemId,
      changes: {
        data: {
          processingStatus: "failed" as const,
          error,
        } satisfies Partial<AudioData> as Item["data"],
      },
    },
    userId,
  );

  await appendAudioEvent(workspaceId, event);
}
