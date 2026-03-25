import type { OcrPage } from "@/lib/pdf/mistral-ocr";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import { logger } from "@/lib/utils/logger";
import { sleep } from "workflow";
import {
  fetchAndOcrPdf,
  persistPdfOcrResult,
  persistPdfOcrFailure,
} from "./steps";

const OCR_TIMEOUT = "7min"; // Per docs: Promise.race with sleep() for timeout

/**
 * Durable workflow for PDF OCR.
 * Runs OCR as a single step and persists the result to workspace.
 * Persists result to workspace on success or failure (survives reload).
 *
 * @param fileUrl - URL of the PDF file (must be from allowed hosts)
 * @param workspaceId - Workspace to update
 * @param itemId - PDF card item ID
 * @param userId - User ID for event attribution
 */
export async function pdfOcrWorkflow(
  fileUrl: string,
  workspaceId: string,
  itemId: string,
  userId: string
) {
  "use workflow";
  const startedAt = Date.now();
  logger.info("[PDF_OCR_WORKFLOW] Workflow start", {
    fileUrl,
    workspaceId,
    itemId,
    userId,
    timeout: OCR_TIMEOUT,
  });

  const runOcr = async (): Promise<{
    ocrPages: OcrPage[];
  }> => {
    return fetchAndOcrPdf(fileUrl);
  };

  try {
    const result = await Promise.race([
      runOcr(),
      sleep(OCR_TIMEOUT).then(() => ({ timedOut: true } as const)),
    ]);

    if ("timedOut" in result) {
      logger.warn("[PDF_OCR_WORKFLOW] Workflow timed out", {
        itemId,
        workspaceId,
        totalMs: Date.now() - startedAt,
      });
      await persistPdfOcrFailure(
        workspaceId,
        itemId,
        userId,
        `PDF OCR timed out after ${OCR_TIMEOUT}`
      );
      return; // Don't throw — catch would cause a second persist
    }

    logger.info("[PDF_OCR_WORKFLOW] Workflow success", {
      itemId,
      workspaceId,
      pageCount: result.ocrPages.length,
      textLength: getOcrPagesTextContent(result.ocrPages).length,
      totalMs: Date.now() - startedAt,
    });
    await persistPdfOcrResult(workspaceId, itemId, userId, result);
    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "PDF OCR failed";
    logger.error("[PDF_OCR_WORKFLOW] Workflow failed", {
      itemId,
      workspaceId,
      totalMs: Date.now() - startedAt,
      errorMessage,
    });
    await persistPdfOcrFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
