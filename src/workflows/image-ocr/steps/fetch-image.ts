import { fetch } from "workflow";

const MAX_IMAGE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB (Mistral limit)

/** OCR-supported MIME types (reject SVG, HEIC/HEIF, AVIF, etc.) */
const OCR_SUPPORTED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/tiff",
]);

/** Map URL extension to MIME type for fallback when Content-Type is missing */
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  tiff: "image/tiff",
  tif: "image/tiff",
};

function mimeFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return EXT_TO_MIME[ext] ?? "image/jpeg";
  } catch {
    return "image/jpeg";
  }
}

/**
 * Step: Fetch image from URL.
 * Returns base64 and mimeType for downstream OCR step.
 */
export async function fetchImage(
  fileUrl: string
): Promise<{ base64: string; mimeType: string; sizeBytes: number }> {
  "use step";

  const res = await fetch(fileUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
  }

  let mimeType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!mimeType.startsWith("image/")) {
    mimeType = mimeFromUrl(fileUrl);
  }
  if (!OCR_SUPPORTED_MIMES.has(mimeType)) {
    throw new Error(`Unsupported image format for OCR: ${mimeType}. Use JPEG, PNG, GIF, WebP, or TIFF.`);
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB limit`);
  }

  return {
    base64: buffer.toString("base64"),
    mimeType,
    sizeBytes: buffer.length,
  };
}
