import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { createEvent } from "@/lib/workspace/events";
import type { OcrPage } from "@/lib/pdf/azure-ocr";

export interface PdfOcrResult {
  textContent: string;
  ocrPages: OcrPage[];
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
  const match = raw?.match(/\((\d+),(t|f)\)/);
  if (match && match[2] === "t") {
    throw new Error("Workspace was modified by another user, please retry");
  }
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
  const match = raw?.match(/\((\d+),(t|f)\)/);
  if (match && match[2] === "t") {
    throw new Error("Workspace was modified by another user, please retry");
  }
}
