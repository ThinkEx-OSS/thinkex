import type { OcrPage } from "@/lib/pdf/azure-ocr";
import { rewriteOcrPageImageIds } from "@/lib/pdf/azure-ocr";
import { sleep } from "workflow";
import { fetchPdf } from "./steps/fetch-pdf";
import { prepareOcrChunks } from "./steps/prepare-ocr-chunks";
import { ocrChunk } from "./steps/ocr-chunk";
import { persistPdfOcrResult, persistPdfOcrFailure } from "./steps/persist-result";

const MAX_CONCURRENT_OCR = 5;
const OCR_TIMEOUT = "5min"; // Per docs: Promise.race with sleep() for timeout

/**
 * Durable workflow for PDF OCR.
 * Each fetch, prepare, and OCR batch is a step — retriable and observable.
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

  const runOcr = async (): Promise<{
    textContent: string;
    ocrPages: OcrPage[];
  }> => {
    const { base64 } = await fetchPdf(fileUrl);
    const { chunks } = await prepareOcrChunks(base64);

    if (chunks.length === 0) {
      return { textContent: "", ocrPages: [] };
    }

    const allPages: OcrPage[] = [];
    let globalIndex = 0;

    for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_OCR) {
      const batch = chunks.slice(i, i + MAX_CONCURRENT_OCR);
      const batchResults = await Promise.all(
        batch.map((chunk) => ocrChunk(chunk.base64, chunk.start, chunk.end))
      );

      for (const pages of batchResults) {
        for (const p of pages) {
          allPages.push(rewriteOcrPageImageIds(p, globalIndex));
          globalIndex++;
        }
      }
    }

    const textContent = allPages
      .map((p) => p.markdown)
      .filter(Boolean)
      .join("\n\n");

    return { textContent, ocrPages: allPages };
  };

  try {
    const result = await Promise.race([
      runOcr(),
      sleep(OCR_TIMEOUT).then(() => ({ timedOut: true } as const)),
    ]);

    if ("timedOut" in result) {
      await persistPdfOcrFailure(
        workspaceId,
        itemId,
        userId,
        `PDF OCR timed out after ${OCR_TIMEOUT}`
      );
      return; // Don't throw — catch would cause a second persist
    }

    await persistPdfOcrResult(workspaceId, itemId, userId, result);
    return result;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "PDF OCR failed";
    await persistPdfOcrFailure(workspaceId, itemId, userId, errorMessage);
    throw err;
  }
}
