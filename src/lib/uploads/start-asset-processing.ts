import { startAudioProcessing } from "@/lib/audio/start-audio-processing";
import { startOcrProcessing } from "@/lib/ocr/client";
import {
  buildOcrCandidatesFromAssets,
  type UploadedAsset,
} from "@/lib/uploads/uploaded-asset";

export async function startAssetProcessing(params: {
  workspaceId: string;
  assets: UploadedAsset[];
  itemIds: Array<string | undefined>;
  onOcrError?: (error: unknown) => void;
}): Promise<void> {
  const { workspaceId, assets, itemIds, onOcrError } = params;
  if (!workspaceId || assets.length === 0 || itemIds.length === 0) return;

  const tasks: Promise<unknown>[] = [];
  const ocrCandidates = buildOcrCandidatesFromAssets(assets, itemIds);

  if (ocrCandidates.length > 0) {
    tasks.push(
      startOcrProcessing(workspaceId, ocrCandidates).catch((error) => {
        onOcrError?.(error);
      })
    );
  }

  assets.forEach((asset, index) => {
    const itemId = itemIds[index];
    if (!itemId || asset.kind !== "audio") return;

    tasks.push(
      startAudioProcessing({
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
