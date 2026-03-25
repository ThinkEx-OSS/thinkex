import { ocrPdfFromUrl } from "@/lib/pdf/mistral-ocr";
import type { OcrPage } from "@/lib/pdf/mistral-ocr";
import { getOcrPagesTextContent } from "@/lib/utils/ocr-pages";
import { logger } from "@/lib/utils/logger";

export interface PdfOcrResult {
  ocrPages: OcrPage[];
}

/**
 * Step: Send a public PDF URL directly to Mistral OCR.
 * Durable step — retriable and survives restarts.
 */
export async function fetchAndOcrPdf(fileUrl: string): Promise<PdfOcrResult> {
  "use step";
  const startedAt = Date.now();
  let fileHost: string | null = null;
  try {
    fileHost = new URL(fileUrl).host;
  } catch {
    fileHost = "invalid-url";
  }

  if (!fileUrl.toLowerCase().includes(".pdf")) {
    throw new Error("URL does not point to a PDF file");
  }

  logger.info("[PDF_OCR_WORKFLOW] Step start", { fileUrl, fileHost });
  const result = await ocrPdfFromUrl(fileUrl);
  logger.info("[PDF_OCR_WORKFLOW] Step complete", {
    pageCount: result.pages.length,
    textLength: getOcrPagesTextContent(result.pages).length,
    totalMs: Date.now() - startedAt,
    fileHost,
  });
  return {
    ocrPages: result.pages,
  };
}
