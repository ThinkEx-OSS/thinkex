import { ocrPdfFromBuffer } from "@/lib/pdf/azure-ocr";
import type { OcrPage } from "@/lib/pdf/azure-ocr";
import { logger } from "@/lib/utils/logger";

const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export interface PdfOcrResult {
  textContent: string;
  ocrPages: OcrPage[];
}

/**
 * Step: Fetch PDF from URL and run Azure OCR.
 * Durable step — retriable and survives restarts.
 */
export async function fetchAndOcrPdf(fileUrl: string): Promise<PdfOcrResult> {
  "use step";

  logger.info("[PDF_OCR_WORKFLOW] Fetch start", { fileUrl });

  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch PDF: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/pdf") &&
    !fileUrl.toLowerCase().includes(".pdf")
  ) {
    throw new Error("URL does not point to a PDF file");
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_PDF_SIZE_BYTES) {
    throw new Error(`PDF exceeds ${MAX_PDF_SIZE_BYTES / (1024 * 1024)}MB limit`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error(`PDF exceeds ${MAX_PDF_SIZE_BYTES / (1024 * 1024)}MB limit`);
  }

  logger.info("[PDF_OCR_WORKFLOW] Fetch complete", {
    sizeBytes: buffer.length,
    sizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
  });

  logger.info("[PDF_OCR_WORKFLOW] OCR start");
  const result = await ocrPdfFromBuffer(buffer);
  logger.info("[PDF_OCR_WORKFLOW] OCR complete", {
    pageCount: result.pages.length,
    textLength: result.textContent.length,
  });

  return {
    textContent: result.textContent,
    ocrPages: result.pages,
  };
}
