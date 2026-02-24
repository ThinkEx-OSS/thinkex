/**
 * PDF upload + OCR flow using direct Supabase upload.
 * Uploads to storage first, then runs OCR via /api/pdf/ocr (bypasses 10MB body limit).
 * Use uploadPdfToStorage + runOcrFromUrl for non-blocking UI (add item after upload, OCR in background).
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

export interface OcrResult {
  textContent: string;
  ocrPages: OcrPage[];
  ocrStatus: "complete" | "failed";
  ocrError?: string;
}

/**
 * Upload a PDF to storage only (no OCR). Use with runOcrFromUrl for non-blocking flow.
 */
export async function uploadPdfToStorage(
  file: File
): Promise<{ url: string; filename: string; fileSize: number }> {
  const { url, filename } = await uploadFileDirect(file);
  return { url, filename: filename || file.name, fileSize: file.size };
}

/**
 * Run OCR on a PDF already in storage. Fire-and-forget; call onComplete when done.
 */
export async function runOcrFromUrl(fileUrl: string): Promise<OcrResult> {
  const res = await fetch("/api/pdf/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl }),
  });
  const json = await res.json();
  if (!res.ok) {
    return {
      textContent: "",
      ocrPages: [],
      ocrStatus: "failed",
      ocrError: json.error || "OCR failed",
    };
  }
  return {
    textContent: json.textContent ?? "",
    ocrPages: json.ocrPages ?? [],
    ocrStatus: "complete",
  };
}

/**
 * Upload a PDF to storage (Supabase or local) and run OCR.
 * Uses direct upload to bypass Next.js body size limits.
 * Blocking: use uploadPdfToStorage + runOcrFromUrl for non-blocking UI.
 */
export async function uploadPdfAndRunOcr(
  file: File
): Promise<PdfUploadWithOcrResult> {
  const { url: fileUrl, filename } = await uploadFileDirect(file);

  const ocrRes = await fetch("/api/pdf/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl }),
  });

  const ocrJson = await ocrRes.json();

  if (!ocrRes.ok) {
    console.warn("[PDF_UPLOAD_OCR] OCR failed:", ocrJson.error);
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

  return {
    fileUrl,
    filename: filename || file.name,
    fileSize: file.size,
    textContent: ocrJson.textContent ?? "",
    ocrPages: ocrJson.ocrPages ?? [],
    ocrStatus: "complete",
  };
}
