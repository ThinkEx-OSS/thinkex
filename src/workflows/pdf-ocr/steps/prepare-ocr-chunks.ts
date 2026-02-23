import {
  prepareOcrChunks as prepareOcrChunksLib,
  type OcrChunkSpec,
} from "@/lib/pdf/azure-ocr";

/**
 * Step: Load PDF, compute chunk ranges, extract each chunk to base64.
 * Returns chunk specs for OCR steps (each chunk = one durable step).
 */
export async function prepareOcrChunks(base64: string): Promise<{
  pageCount: number;
  chunks: OcrChunkSpec[];
}> {
  "use step";

  const buffer = Buffer.from(base64, "base64");
  return prepareOcrChunksLib(buffer);
}
