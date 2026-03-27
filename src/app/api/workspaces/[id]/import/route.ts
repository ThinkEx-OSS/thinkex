import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { requireAuthWithUserInfo, verifyWorkspaceAccess, withErrorHandling } from "@/lib/api/workspace-helpers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { hasDuplicateName } from "@/lib/workspace/unique-name";
import { checkAndCreateSnapshot } from "@/lib/workspace/snapshot-manager";
import { buildPdfDataFromUpload } from "@/lib/pdf/pdf-item";
import { getRandomCardColor } from "@/lib/workspace-state/colors";
import { filterOcrCandidates } from "@/lib/ocr/dispatch";
import { isAllowedOcrFileUrl } from "@/lib/ocr/url-validation";
import { ocrDispatchWorkflow } from "@/workflows/ocr-dispatch";
import { start } from "workflow/api";
import type { Item } from "@/lib/workspace-state/types";
import type { OcrCandidate } from "@/lib/ocr/types";

export const maxDuration = 30;

interface ImportFile {
  storagePath: string;
  publicUrl: string;
  displayName: string;
  mimeType: string;
  folderId?: string;
}

interface AppendResult {
  version: number;
  eventId: string;
  timestamp: number;
}

async function appendBulkItemsWithRetry(
  workspaceId: string,
  items: Item[],
  userId: string,
  userName: string | undefined,
  maxAttempts = 3
): Promise<AppendResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const versionResult = await db.execute(
      sql`SELECT get_workspace_version(${workspaceId}::uuid) as version`
    );
    const baseVersion = (versionResult[0] as { version: number } | undefined)?.version ?? 0;

    const eventId = randomUUID();
    const timestamp = Date.now();
    const payload = JSON.stringify({ items });

    const result = await db.execute(sql`
      SELECT append_workspace_event(
        ${workspaceId}::uuid,
        ${eventId}::text,
        ${"BULK_ITEMS_CREATED"}::text,
        ${payload}::jsonb,
        ${timestamp}::bigint,
        ${userId}::text,
        ${baseVersion}::integer,
        ${userName ?? null}::text
      ) as result
    `);

    const rawResult = (result[0] as { result: string } | undefined)?.result;
    if (!rawResult) throw new Error("No result from append_workspace_event");

    const match = rawResult.match(/\((\d+),(t|f)\)/);
    if (!match) throw new Error(`Unexpected append result: ${rawResult}`);

    const conflict = match[2] === "t";
    if (!conflict) {
      checkAndCreateSnapshot(workspaceId).catch(() => {});
      return { version: parseInt(match[1], 10), eventId, timestamp };
    }
  }
  throw new Error("Version conflict persisted after max retries — workspace is under heavy concurrent edits");
}

async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const [{ id }, { userId, name: userName }] = await Promise.all([
    params,
    requireAuthWithUserInfo(),
  ]);

  await verifyWorkspaceAccess(id, userId, "editor");

  const body = await request.json();
  const files: ImportFile[] = Array.isArray(body.files) ? body.files : [];

  if (files.length === 0) {
    return NextResponse.json({ error: "At least one file is required" }, { status: 400 });
  }

  // Validate required fields on each file
  for (const file of files) {
    if (!file.storagePath || !file.publicUrl || !file.displayName || !file.mimeType) {
      return NextResponse.json(
        { error: "Each file must have storagePath, publicUrl, displayName, and mimeType" },
        { status: 400 }
      );
    }
  }

  // Load state once — used for folderId validation and duplicate name resolution
  const state = await loadWorkspaceState(id);

  // Validate any provided folderIds
  for (const file of files) {
    if (file.folderId) {
      const folderItem = state.items.find(
        (i: Item) => i.id === file.folderId && i.type === "folder"
      );
      if (!folderItem) {
        return NextResponse.json(
          { error: `folderId "${file.folderId}" does not refer to a folder in this workspace` },
          { status: 400 }
        );
      }
    }
  }

  // Build items — resolve duplicate names, set ocrStatus: "processing"
  const items: Item[] = [];
  // Accumulate items as we build them so later files in the same batch
  // don't collide with earlier ones in the same import
  const accumulatedItems: Item[] = [...state.items];

  for (const file of files) {
    const folderId = file.folderId ?? null;
    let name = file.displayName.trim();

    if (hasDuplicateName(accumulatedItems, name, "pdf", folderId)) {
      // Append counter before the extension: "lecture.pdf" → "lecture (2).pdf"
      const dotIndex = name.lastIndexOf(".");
      const base = dotIndex !== -1 ? name.slice(0, dotIndex) : name;
      const ext = dotIndex !== -1 ? name.slice(dotIndex) : "";
      let counter = 2;
      while (hasDuplicateName(accumulatedItems, `${base} (${counter})${ext}`, "pdf", folderId)) {
        counter++;
      }
      name = `${base} (${counter})${ext}`;
    }

    const item: Item = {
      id: randomUUID(),
      type: "pdf",
      name,
      subtitle: "",
      color: getRandomCardColor(),
      data: buildPdfDataFromUpload({
        fileUrl: file.publicUrl,
        filename: file.storagePath,
        contentType: file.mimeType,
      }),
      folderId: folderId ?? undefined,
      lastSource: "user",
    };

    items.push(item);
    accumulatedItems.push(item);
  }

  const { version, eventId, timestamp } = await appendBulkItemsWithRetry(id, items, userId, userName);

  // Broadcast to connected clients via Supabase SDK so the workspace page updates without a reload.
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const channel = supabase.channel(`workspace:${id}:events`);
      const result = await channel.send({
        type: "broadcast",
        event: "workspace_event",
        payload: {
          type: "BULK_ITEMS_CREATED",
          payload: { items },
          timestamp,
          userId,
          userName: userName ?? undefined,
          id: eventId,
          version,
        },
      });
      await supabase.removeChannel(channel);
      console.log(`[import] Realtime broadcast result=${result}`);
    }
  } catch (err) {
    console.error("[import] Realtime broadcast error:", err);
  }

  // Trigger OCR for all items — invoke workflow directly, no self-HTTP
  const rawCandidates: OcrCandidate[] = items.map((item) => ({
    itemId: item.id,
    itemType: "file" as const,
    fileUrl: (item.data as { fileUrl: string }).fileUrl,
  }));
  const candidates = filterOcrCandidates(rawCandidates).filter((c) =>
    isAllowedOcrFileUrl(c.fileUrl)
  );

  let ocrRunId: string | null = null;
  if (candidates.length > 0) {
    try {
      const run = await start(ocrDispatchWorkflow, [candidates, id, userId]);
      ocrRunId = run.runId ?? null;
    } catch (err) {
      console.error("[import] OCR workflow start error:", err);
    }
  }

  return NextResponse.json({
    success: true,
    itemIds: items.map((i) => i.id),
    ocrRunId,
  });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/[id]/import");
