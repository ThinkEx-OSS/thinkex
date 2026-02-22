/**
 * PDF upload + OCR flow using direct Supabase upload.
 * Uploads to storage first, then runs OCR via /api/pdf/ocr (bypasses 10MB body limit).
 */

import type { OcrPage } from "@/lib/pdf/azure-ocr";
import { uploadFileDirect } from "./client-upload";

export interface PdfUploadWithOcrResult {
  fileUrl: string;
  filename: string;
  fileSize: number;
  textContent: string;
  ocrPages: OcrPage[];
  ocrStatus: "complete" | "failed";
  ocrError?: string;
}

/**
 * Upload a PDF to storage (Supabase or local) and run OCR.
 * Uses direct upload to bypass Next.js body size limits.
 */
export async function uploadPdfAndRunOcr(
  file: File
): Promise<PdfUploadWithOcrResult> {
  const t0 = performance.now();
  console.info(
    `[PDF_UPLOAD_OCR] Start: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
  );

  const { url: fileUrl, filename } = await uploadFileDirect(file, { log: true });
  const uploadMs = performance.now() - t0;
  console.info(`[PDF_UPLOAD_OCR] Upload complete: ${uploadMs.toFixed(0)}ms`);

  const tOcr = performance.now();
  const ocrRes = await fetch("/api/pdf/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl }),
  });

  const ocrJson = await ocrRes.json();
  const ocrMs = performance.now() - tOcr;
  const totalMs = performance.now() - t0;
  console.info(
    `[PDF_UPLOAD_OCR] OCR request: ${ocrMs.toFixed(0)}ms | total: ${totalMs.toFixed(0)}ms`
  );

  if (!ocrRes.ok) {
    console.warn(
      `[PDF_UPLOAD_OCR] OCR failed (${totalMs.toFixed(0)}ms):`,
      ocrJson.error
    );
    return {
      fileUrl,
      filename: filename || file.name,
      fileSize: file.size,
      textContent: "",
      ocrPages: [],
      ocrStatus: "failed",
      ocrError: ocrJson.error || "OCR failed",
    };
  }

  console.info(
    `[PDF_UPLOAD_OCR] Done: ${file.name} | ${ocrJson.ocrPages?.length ?? 0} pages | ${totalMs.toFixed(0)}ms total`
  );
  return {
    fileUrl,
    filename: filename || file.name,
    fileSize: file.size,
    textContent: ocrJson.textContent ?? "",
    ocrPages: ocrJson.ocrPages ?? [],
    ocrStatus: "complete",
  };
}
