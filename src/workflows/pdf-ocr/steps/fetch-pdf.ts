const MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * Step: Fetch PDF from URL.
 * Returns base64 for downstream steps (avoids passing Buffer across step boundaries).
 */
export async function fetchPdf(fileUrl: string): Promise<{ base64: string; sizeBytes: number }> {
  "use step";

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

  return {
    base64: buffer.toString("base64"),
    sizeBytes: buffer.length,
  };
}
