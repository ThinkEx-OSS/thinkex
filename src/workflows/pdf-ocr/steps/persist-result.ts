import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createEvent } from "@/lib/workspace/events";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import type { PdfOcrResult } from "./fetch-and-ocr";

const APPEND_RESULT_REGEX = /\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i;

/**
 * Append an event to the workspace and check for version conflict.
 * Throws on conflict so the workflow framework can retry.
 */
async function appendWorkspaceEvent(
  workspaceId: string,
  event: WorkspaceEvent
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
      "append_workspace_event returned no result — database may have failed"
    );
  }

  const raw = appendResult[0].result as string;
  const match = raw.match(APPEND_RESULT_REGEX);
  if (!match) {
    throw new Error(
      `append_workspace_event returned unexpected format: ${raw}`
    );
  }
  const modified = match[2].toLowerCase();
  if (modified === "t" || modified === "true") {
    throw new Error(
      `Version conflict appending event ${event.id} to workspace ${workspaceId} (baseVersion=${baseVersion}). Workflow will retry automatically.`
    );
  }
}

/**
 * Persist PDF OCR result to workspace as ITEM_UPDATED event.
 * Durable step — retriable.
 */
export async function persistPdfOcrResult(
  workspaceId: string,
  itemId: string,
  userId: string,
  result: PdfOcrResult
): Promise<void> {
  "use step";

  const event = createEvent(
    "ITEM_UPDATED",
    {
      id: itemId,
      changes: {
        data: {
          textContent: result.textContent ?? "",
          ocrPages: result.ocrPages ?? [],
          ocrStatus: "complete" as const,
          ocrError: undefined,
        },
      },
      source: "agent",
    },
    userId
  );

  await appendWorkspaceEvent(workspaceId, event);
}

/**
 * Persist PDF OCR failure to workspace.
 * Durable step — retriable.
 */
export async function persistPdfOcrFailure(
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
          ocrStatus: "failed" as const,
          ocrError: error,
          ocrPages: [],
        },
      },
      source: "agent",
    },
    userId
  );

  await appendWorkspaceEvent(workspaceId, event);
}
