import {
  db,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
} from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import type { TranscribeResult } from "./transcribe";

export async function persistAudioResult(
  workspaceId: string,
  itemId: string,
  _userId: string,
  result: TranscribeResult,
): Promise<void> {
  "use step";

  const transcriptText =
    result.segments?.map((s) => s.content).join("\n") || null;
  const updatedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceItemExtracted)
      .values({
        workspaceId,
        itemId,
        searchText: transcriptText ?? "",
        transcriptText,
        transcriptSegments: result.segments as unknown as Record<
          string,
          unknown
        >,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: [
          workspaceItemExtracted.workspaceId,
          workspaceItemExtracted.itemId,
        ],
        set: {
          transcriptText,
          transcriptSegments: result.segments as unknown as Record<
            string,
            unknown
          >,
          searchText: transcriptText ?? "",
          updatedAt,
        },
      });

    await tx
      .update(workspaceItems)
      .set({
        processingStatus: "complete",
        hasTranscript: true,
        lastModified: Date.now(),
      })
      .where(
        and(
          eq(workspaceItems.workspaceId, workspaceId),
          eq(workspaceItems.itemId, itemId),
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
          eq(workspaceItemContent.itemId, itemId),
        ),
      )
      .limit(1);

    const currentAssetData =
      (contentRow?.assetData as Record<string, unknown> | null) ?? {};

    await tx
      .update(workspaceItemContent)
      .set({
        structuredData: {
          summary: result.summary ?? "",
        },
        ...(typeof result.duration === "number" && result.duration > 0
          ? {
              assetData: {
                ...currentAssetData,
                duration: result.duration,
              },
            }
          : {}),
        updatedAt,
      })
      .where(
        and(
          eq(workspaceItemContent.workspaceId, workspaceId),
          eq(workspaceItemContent.itemId, itemId),
        ),
      );
  });
}

export async function persistAudioFailure(
  workspaceId: string,
  itemId: string,
  _userId: string,
  error: string,
): Promise<void> {
  "use step";

  const updatedAt = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx
      .update(workspaceItems)
      .set({
        processingStatus: "failed",
        lastModified: Date.now(),
      })
      .where(
        and(
          eq(workspaceItems.workspaceId, workspaceId),
          eq(workspaceItems.itemId, itemId),
        ),
      );

    await tx
      .update(workspaceItemContent)
      .set({
        structuredData: { error },
        updatedAt,
      })
      .where(
        and(
          eq(workspaceItemContent.workspaceId, workspaceId),
          eq(workspaceItemContent.itemId, itemId),
        ),
      );
  });
}
