/**
 * Mistral OCR integration for PDFs and images via the direct OCR API.
 */

import { logger } from "@/lib/utils/logger";
import { callMistralOcr } from "./mistral-ocr-client";

const DEFAULT_MODEL = "mistral-ocr-latest";
const DEFAULT_ENDPOINT = "https://api.mistral.ai/v1/ocr";

interface OcrConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

function getOcrConfig(): OcrConfig {
  return {
    endpoint: process.env.MISTRAL_OCR_ENDPOINT ?? DEFAULT_ENDPOINT,
    apiKey: process.env.MISTRAL_API_KEY ?? "",
    model: process.env.MISTRAL_OCR_MODEL ?? DEFAULT_MODEL,
  };
}

export interface OcrPage {
  index: number;
  markdown: string;
  footer?: string | null;
  header?: string | null;
  hyperlinks?: unknown[];
  tables?: unknown[];
}

export interface OcrResult {
  pages: OcrPage[];
}

function buildBaseBody(document: Record<string, unknown>): Record<string, unknown> {
  return {
    document,
    extract_header: true,
    extract_footer: true,
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
  const { pages } = await callMistralOcr(
    getOcrConfig(),
    buildBaseBody({
      type: "image_url",
      image_url: fileUrl,
    }),
    "Mistral image OCR failed",
    "[IMAGE_OCR_MISTRAL]"
  );

  return buildOcrResult(pages);
}

export async function ocrPdfFromUrl(fileUrl: string): Promise<OcrResult> {
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
