import {
  ocrSingleChunk,
  type OcrChunkResult,
} from "@/lib/pdf/azure-ocr";

/**
 * Step: Run Azure OCR on a single PDF chunk.
 * Each chunk is a durable step — retriable independently.
 * Returns { pages, endpointIndex } so endpointIndex is visible in workflow observability.
 */
export async function ocrChunk(
  base64: string,
  start: number,
  end: number
): Promise<OcrChunkResult> {
  "use step";

  return ocrSingleChunk(base64);
}

// OCR retries are handled inside the Azure client with longer cooldown-aware backoff.
ocrChunk.maxRetries = 0;
