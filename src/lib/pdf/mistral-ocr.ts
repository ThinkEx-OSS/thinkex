/**
 * Mistral OCR integration for documents and images via the direct OCR API.
 */

import { MISTRAL_BBOX_ANNOTATION_FORMAT } from "@/lib/pdf/ocr-figure-inline";
import { logger } from "@/lib/utils/logger";
import { callMistralOcr } from "./mistral-ocr-client";
import { getOcrConfig } from "@/lib/ocr/config";
import type { OcrPage } from "@/lib/ocr/types";
export type { OcrPage } from "@/lib/ocr/types";

export interface OcrResult {
  pages: OcrPage[];
}

function buildBaseBody(document: Record<string, unknown>): Record<string, unknown> {
  return {
    document,
    extract_header: true,
    extract_footer: true,
    bbox_annotation_format: MISTRAL_BBOX_ANNOTATION_FORMAT,
    include_image_base64: false,
  };
}

function normalizeOcrPage(page: OcrPage, globalPageIndex: number): OcrPage {
  return { ...page, index: globalPageIndex };
}

function buildOcrResult(pages: OcrPage[]): OcrResult {
  return {
    pages: pages.map((page, index) => normalizeOcrPage(page, index)),
  };
}

export async function ocrImageFromUrl(fileUrl: string): Promise<OcrResult> {
  const t0 = Date.now();
  logger.info("[IMAGE_OCR_MISTRAL] URL OCR start", {
    fileUrl,
  });

  const { pages } = await callMistralOcr(
    getOcrConfig(),
    buildBaseBody({
      type: "image_url",
      image_url: fileUrl,
    }),
    "Mistral image OCR failed",
    "[IMAGE_OCR_MISTRAL]"
  );

  const result = buildOcrResult(pages);

  logger.info("[IMAGE_OCR_MISTRAL] Complete", {
    fileUrl,
    pageCount: result.pages.length,
    totalMs: Date.now() - t0,
    source: "image_url",
  });

  return result;
}

export async function ocrDocumentFromUrl(fileUrl: string): Promise<OcrResult> {
  const t0 = Date.now();
  let fileHost: string | null = null;
  try {
    fileHost = new URL(fileUrl).host;
  } catch {
    fileHost = "invalid-url";
  }

  logger.info("[PDF_OCR_MISTRAL] URL OCR start", {
    fileUrl,
    fileHost,
  });

  const { pages } = await callMistralOcr(
    getOcrConfig(),
    buildBaseBody({
      type: "document_url",
      document_url: fileUrl,
    }),
    "Mistral OCR failed",
    "[PDF_OCR_MISTRAL]"
  );
  const result = buildOcrResult(pages);

  logger.info("[PDF_OCR_MISTRAL] Complete", {
    pageCount: result.pages.length,
    totalMs: Date.now() - t0,
    source: "document_url",
    fileHost,
  });

  return result;
}

export async function ocrPdfFromUrl(fileUrl: string): Promise<OcrResult> {
  return ocrDocumentFromUrl(fileUrl);
}
