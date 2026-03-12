import { ocrSingleImage } from "@/lib/pdf/azure-ocr";

/**
 * Step: Run Azure OCR on a single image.
 */
export async function ocrImage(
  base64: string,
  mimeType: string
): Promise<{ pages: Awaited<ReturnType<typeof ocrSingleImage>>["pages"] }> {
  "use step";

  const { pages } = await ocrSingleImage(base64, mimeType);
  return { pages };
}
