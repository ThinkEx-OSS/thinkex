import type { OcrPage } from "@/lib/pdf/mistral-ocr";
import { sleep } from "workflow";
import { ocrImage } from "./steps/ocr-image";
import {
  persistImageOcrResult,
  persistImageOcrFailure,
  type ImageOcrResult,
} from "./steps/persist-result";

const OCR_TIMEOUT = "2min";

/**
 * Durable workflow for image OCR.
 * Runs Mistral OCR against the stored image URL and persists result to workspace.
 *
 * @param fileUrl - URL of the image file (must be from allowed hosts)
 * @param workspaceId - Workspace to update
 * @param itemId - Image card item ID
 * @param userId - User ID for event attribution
 */
export async function imageOcrWorkflow(
  fileUrl: string,
  workspaceId: string,
  itemId: string,
  userId: string
) {
  "use workflow";

  const runOcr = async (): Promise<ImageOcrResult> => {
    const { pages } = await ocrImage(fileUrl);

    const ocrPages: OcrPage[] = pages.map((p, i) => ({
      ...p,
      index: i,
    }));

    return { ocrPages };
  };

  try {
    const result = await Promise.race([
      runOcr(),
      sleep(OCR_TIMEOUT).then(() => ({ timedOut: true } as const)),
    ]);

    if ("timedOut" in result) {
      await persistImageOcrFailure(
        workspaceId,
        itemId,
        userId,
        `Image OCR timed out after ${OCR_TIMEOUT}`
      );
      return;
    }

    await persistImageOcrResult(workspaceId, itemId, userId, result);
    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Image OCR failed";
    await persistImageOcrFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
