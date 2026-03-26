import type { OcrCandidate, OcrMode } from "./types";

export const OCR_BATCH_THRESHOLD = 6;

export function filterOcrCandidates(
  candidates: OcrCandidate[] | undefined | null
): OcrCandidate[] {
  if (!candidates?.length) return [];

  return candidates.filter(
    (candidate) =>
      !!candidate.itemId &&
      !!candidate.fileUrl &&
      (candidate.itemType === "file" || candidate.itemType === "image")
  );
}

export function selectOcrMode(candidateCount: number): OcrMode {
  return candidateCount >= OCR_BATCH_THRESHOLD ? "batch" : "direct";
}
