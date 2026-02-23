import { ocrSingleChunk } from "@/lib/pdf/azure-ocr";
import type { OcrPage } from "@/lib/pdf/azure-ocr";

/**
 * Step: Run Azure OCR on a single PDF chunk.
 * Each chunk is a durable step — retriable independently.
 */
export async function ocrChunk(
  base64: string,
  start: number,
  end: number
): Promise<OcrPage[]> {
  "use step";

  return ocrSingleChunk(base64);
}
