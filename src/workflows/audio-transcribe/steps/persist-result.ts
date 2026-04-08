import { createEvent } from "@/lib/workspace/events";
import { broadcastWorkspaceEventFromServer } from "@/lib/realtime/server-broadcast";
import type { AudioData, Item } from "@/lib/workspace-state/types";
import type { TranscribeResult } from "./transcribe";
import { appendWorkspaceEventAtCurrentVersionWithProjection } from "@/lib/workspace/workspace-event-store";

/**
 * Persist transcription result to workspace as ITEM_UPDATED event.
 * Durable step — retriable.
 */
export async function persistAudioResult(
  workspaceId: string,
  itemId: string,
  userId: string,
  result: TranscribeResult,
): Promise<void> {
  "use step";

  const event = createEvent(
    "ITEM_UPDATED",
    {
      id: itemId,
      changes: {
        data: ({
          summary: result.summary,
          segments: result.segments,
          ...(typeof result.duration === "number" &&
            result.duration > 0 && { duration: result.duration }),
          processingStatus: "complete" as const,
        } satisfies Partial<AudioData>) as Item["data"],
      },
    },
    userId,
  );

  const appendResult = await appendWorkspaceEventAtCurrentVersionWithProjection({
    workspaceId,
    event,
  });
  if (appendResult.conflict) {
    throw new Error(
      `Version conflict appending event ${event.id} to workspace ${workspaceId}. Workflow will retry automatically.`,
    );
  }
  await broadcastWorkspaceEventFromServer(workspaceId, {
    ...event,
    version: appendResult.version,
  });
}

/**
 * Persist audio processing failure to workspace.
 * Durable step — retriable.
 */
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
        data: ({
          processingStatus: "failed" as const,
          error,
        } satisfies Partial<AudioData>) as Item["data"],
      },
    },
    userId,
  );

  const appendResult = await appendWorkspaceEventAtCurrentVersionWithProjection({
    workspaceId,
    event,
  });
  if (appendResult.conflict) {
    throw new Error(
      `Version conflict appending event ${event.id} to workspace ${workspaceId}. Workflow will retry automatically.`,
    );
  }
  await broadcastWorkspaceEventFromServer(workspaceId, {
    ...event,
    version: appendResult.version,
  });
}
