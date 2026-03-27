import { logger } from "@/lib/utils/logger";
import { callMistralOcr } from "@/lib/pdf/mistral-ocr-client";
import { getOcrConfig } from "./config";
import type { OcrCandidate, OcrItemResult, OcrItemType, OcrPage } from "./types";

function buildDocumentBody(itemType: OcrItemType, fileUrl: string): Record<string, unknown> {
  return {
    document:
      itemType === "image"
        ? { type: "image_url", image_url: fileUrl }
        : { type: "document_url", document_url: fileUrl },
    extract_header: true,
    extract_footer: true,
  };
}

function normalizePages(pages: OcrPage[]): OcrPage[] {
  return pages.map((page, index) => ({
    ...page,
    index,
  }));
}

export async function runDirectOcrForCandidate(
  candidate: OcrCandidate
): Promise<OcrItemResult> {
  const config = getOcrConfig();
  const logLabel =
    candidate.itemType === "image" ? "[OCR_DIRECT_IMAGE]" : "[OCR_DIRECT_FILE]";
  const errorLabel =
    candidate.itemType === "image" ? "Mistral image OCR failed" : "Mistral file OCR failed";

  logger.info(`${logLabel} Starting direct OCR`, {
    itemId: candidate.itemId,
    itemType: candidate.itemType,
  });

  try {
    const { pages } = await callMistralOcr(
      config,
      buildDocumentBody(candidate.itemType, candidate.fileUrl),
      errorLabel,
      logLabel
    );

    return {
      itemId: candidate.itemId,
      itemType: candidate.itemType,
      ok: true,
      pages: normalizePages(pages),
    };
  } catch (error) {
    return {
      itemId: candidate.itemId,
      itemType: candidate.itemType,
      ok: false,
      error: error instanceof Error ? error.message : "OCR failed",
    };
  }
}
