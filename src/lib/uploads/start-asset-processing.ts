import { startAudioProcessing } from "@/lib/audio/start-audio-processing";
import { startOcrProcessing } from "@/lib/ocr/client";
import type { OcrCandidate } from "@/lib/ocr/types";
import {
  buildOcrCandidatesFromAssets,
  type UploadedAsset,
} from "@/lib/uploads/uploaded-asset";
import { logger } from "@/lib/utils/logger";

interface StartAudioProcessingParams {
  workspaceId: string;
  itemId: string;
  fileUrl: string;
  filename: string;
  mimeType: string;
}

export async function startAssetProcessing(params: {
  workspaceId: string;
  assets: UploadedAsset[];
  itemIds: Array<string | undefined>;
  onOcrError?: (error: unknown) => void | Promise<void>;
  startOcrProcessingFn?: (
    workspaceId: string,
    candidates: OcrCandidate[]
  ) => Promise<void>;
  startAudioProcessingFn?: (
    params: StartAudioProcessingParams
  ) => Promise<void>;
}): Promise<void> {
  const {
    workspaceId,
    assets,
    itemIds,
    onOcrError,
    startOcrProcessingFn = startOcrProcessing,
    startAudioProcessingFn = startAudioProcessing,
  } = params;
  if (!workspaceId || assets.length === 0 || itemIds.length === 0) return;

  const tasks: Promise<unknown>[] = [];
  if (itemIds.length !== assets.length) {
    logger.warn("[ASSET_PROCESSING] Asset/itemId count mismatch", {
      workspaceId,
      assetCount: assets.length,
      itemIdCount: itemIds.length,
    });
  }

  let ocrCandidates = [] as ReturnType<typeof buildOcrCandidatesFromAssets>;
  try {
    ocrCandidates = buildOcrCandidatesFromAssets(assets, itemIds);
  } catch (error) {
    logger.warn("[ASSET_PROCESSING] Failed to build OCR candidates", {
      workspaceId,
      assetCount: assets.length,
      itemIdCount: itemIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
    onOcrError?.(error);
  }

  if (ocrCandidates.length > 0) {
    tasks.push(
      startOcrProcessingFn(workspaceId, ocrCandidates).catch(async (error) => {
        await onOcrError?.(error);
      })
    );
  }

  assets.forEach((asset, index) => {
    const itemId = itemIds[index];
    if (!itemId) {
      logger.warn("[ASSET_PROCESSING] Missing itemId for asset", {
        workspaceId,
        index,
        assetKind: asset.kind,
        assetFilename: asset.filename,
        assetFileUrl: asset.fileUrl,
      });
      return;
    }

    if (asset.kind !== "audio") return;

    tasks.push(
      startAudioProcessingFn({
        workspaceId,
        itemId,
        fileUrl: asset.fileUrl,
        filename: asset.filename,
        mimeType: asset.originalFile?.type || asset.contentType || "audio/mpeg",
      })
    );
  });

  if (tasks.length === 0) return;
  await Promise.allSettled(tasks);
}
