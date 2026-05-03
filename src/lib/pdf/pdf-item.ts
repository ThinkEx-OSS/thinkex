import type { PdfData } from "@/lib/workspace-state/types";

export interface UploadedPdfMeta {
  fileUrl: string;
  filename: string;
  contentType: string;
  fileSize?: number;
  displayName?: string;
}

export function isPdfUploadMeta(filename: string, contentType: string): boolean {
  return contentType === "application/pdf" || filename.toLowerCase().endsWith(".pdf");
}

export function buildPdfDataFromUpload(meta: UploadedPdfMeta): PdfData {
  return {
    fileUrl: meta.fileUrl,
    filename: meta.filename,
    fileSize: meta.fileSize,
    thumbnailStatus: "pending",
    ocrStatus: "processing",
    ocrPages: [],
  };
}

export function getPdfSourceUrl(pdfData: PdfData | undefined | null): string | undefined {
  return pdfData?.fileUrl;
}

export function getPdfSourceFilename(pdfData: PdfData | undefined | null): string | undefined {
  return pdfData?.filename;
}

export function getPdfPreviewUrl(pdfData: PdfData | undefined | null): string | undefined {
  return pdfData?.thumbnailUrl || pdfData?.fileUrl;
}
