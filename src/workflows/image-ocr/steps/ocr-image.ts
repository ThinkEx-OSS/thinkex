import { ocrImageFromUrl } from "@/lib/pdf/mistral-ocr";

/**
 * Step: Run Mistral OCR on a single image URL.
 */
export async function ocrImage(
  fileUrl: string
): Promise<Awaited<ReturnType<typeof ocrImageFromUrl>>> {
  "use step";

  return await ocrImageFromUrl(fileUrl);
}

// OCR retries are handled inside the Mistral client with longer cooldown-aware backoff.
ocrImage.maxRetries = 0;
