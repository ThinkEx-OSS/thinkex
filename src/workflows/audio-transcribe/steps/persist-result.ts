import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createEvent } from "@/lib/workspace/events";
import { checkAndCreateSnapshot } from "@/lib/workspace/snapshot-manager";
import type { TranscribeResult } from "./transcribe";

/**
 * Persist transcription result to workspace as ITEM_UPDATED event.
 * Durable step — retriable.
 */
export async function persistAudioResult(
  workspaceId: string,
  itemId: string,
  userId: string,
  result: TranscribeResult
): Promise<void> {
  "use step";

  const event = createEvent(
    "ITEM_UPDATED",
    {
      id: itemId,
      changes: {
        data: {
          summary: result.summary,
          segments: result.segments,
          ...(typeof result.duration === "number" &&
            result.duration > 0 && { duration: result.duration }),
          processingStatus: "complete" as const,
        },
      },
      source: "agent",
    },
    userId
  );

  const versionResult = await db.execute(sql`
    SELECT get_workspace_version(${workspaceId}::uuid) as version
  `);
  const baseVersion = versionResult[0]?.version ?? 0;

  const appendResult = await db.execute(sql`
    SELECT append_workspace_event(
      ${workspaceId}::uuid,
      ${event.id}::text,
      ${event.type}::text,
      ${JSON.stringify(event.payload)}::jsonb,
      ${event.timestamp}::bigint,
      ${event.userId}::text,
      ${baseVersion}::integer,
      NULL::text
    ) as result
  `);

  const raw = appendResult[0]?.result as string | undefined;
  if (raw) {
    const match = raw.match(/\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i);
    if (!match) {
      throw new Error(
        `append_workspace_event returned unexpected format: ${raw}`
      );
    }
    const modified = match[2].toLowerCase();
    if (modified === "t" || modified === "true") {
      throw new Error(
        `Version conflict appending event ${event.id} to workspace ${workspaceId} (baseVersion=${versionResult[0]?.version ?? 0}). Workflow will retry automatically.`
      );
    }
  }
  checkAndCreateSnapshot(workspaceId).catch(() => {});
}

/**
 * Persist audio processing failure to workspace.
 * Durable step — retriable.
 */
export async function persistAudioFailure(
  workspaceId: string,
  itemId: string,
  userId: string,
  error: string
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
        },
      },
      source: "agent",
    },
    userId
  );

  const versionResult = await db.execute(sql`
    SELECT get_workspace_version(${workspaceId}::uuid) as version
  `);
  const baseVersion = versionResult[0]?.version ?? 0;

  const appendResult = await db.execute(sql`
    SELECT append_workspace_event(
      ${workspaceId}::uuid,
      ${event.id}::text,
      ${event.type}::text,
      ${JSON.stringify(event.payload)}::jsonb,
      ${event.timestamp}::bigint,
      ${event.userId}::text,
      ${baseVersion}::integer,
      NULL::text
    ) as result
  `);

  const raw = appendResult[0]?.result as string | undefined;
  if (raw) {
    const match = raw.match(/\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i);
    if (!match) {
      throw new Error(
        `append_workspace_event returned unexpected format: ${raw}`
      );
    }
    const modified = match[2].toLowerCase();
    if (modified === "t" || modified === "true") {
      throw new Error(
        `Version conflict appending event ${event.id} to workspace ${workspaceId} (baseVersion=${versionResult[0]?.version ?? 0}). Workflow will retry automatically.`
      );
    }
  }
  checkAndCreateSnapshot(workspaceId).catch(() => {});
}
