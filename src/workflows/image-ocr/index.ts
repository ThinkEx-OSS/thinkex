import type { OcrPage } from "@/lib/pdf/azure-ocr";
import { sleep } from "workflow";
import { fetchImage } from "./steps/fetch-image";
import { ocrImage } from "./steps/ocr-image";
import {
  persistImageOcrResult,
  persistImageOcrFailure,
  type ImageOcrResult,
} from "./steps/persist-result";

const OCR_TIMEOUT = "2min";

/**
 * Durable workflow for image OCR.
 * Fetches image, runs Azure Mistral Document AI OCR, persists result to workspace.
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
    const { base64, mimeType } = await fetchImage(fileUrl);
    const { pages } = await ocrImage(base64, mimeType);

    const ocrPages: OcrPage[] = pages.map((p, i) => ({
      ...p,
      index: i,
    }));

    const textContent = ocrPages
      .map((p) => p.markdown)
      .filter(Boolean)
      .join("\n\n");

    return { textContent, ocrPages };
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
