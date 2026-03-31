import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createEvent } from "@/lib/workspace/events";
import { checkAndCreateSnapshot } from "@/lib/workspace/snapshot-manager";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import type { OcrItemResult } from "@/lib/ocr/types";
import { broadcastWorkspaceEventFromServer } from "@/lib/realtime/server-broadcast";

const APPEND_RESULT_REGEX = /\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i;

async function appendWorkspaceEvent(
  workspaceId: string,
  event: WorkspaceEvent,
): Promise<void> {
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

  if (!appendResult || appendResult.length === 0 || !appendResult[0]) {
    throw new Error(
      "append_workspace_event returned no result — database may have failed",
    );
  }

  const raw = appendResult[0].result as string;
  const match = raw.match(APPEND_RESULT_REGEX);
  if (!match) {
    throw new Error(
      `append_workspace_event returned unexpected format: ${raw}`,
    );
  }

  const modified = match[2].toLowerCase();
  if (modified === "t" || modified === "true") {
    throw new Error(
      `Version conflict appending event ${event.id} to workspace ${workspaceId} (baseVersion=${baseVersion}). Workflow will retry automatically.`,
    );
  }

  await broadcastWorkspaceEventFromServer(workspaceId, {
    ...event,
    version: Number(match[1]),
  });
}

export async function persistOcrResults(
  workspaceId: string,
  userId: string,
  results: OcrItemResult[],
): Promise<void> {
  "use step";

  const event = createEvent(
    "BULK_ITEMS_PATCHED",
    {
      updates: results.map((result) => ({
        id: result.itemId,
        changes: {
          data: result.ok
            ? {
                ocrPages: result.pages,
                ocrStatus: "complete" as const,
                ocrError: undefined,
              }
            : {
                ocrPages: [],
                ocrStatus: "failed" as const,
                ocrError: result.error,
              },
        },
        source: "agent" as const,
      })),
    },
    userId,
  );

  await appendWorkspaceEvent(workspaceId, event);
  checkAndCreateSnapshot(workspaceId).catch(() => {});
}
