import { logger } from "@/lib/utils/logger";
import { filterOcrCandidates, selectOcrMode } from "./dispatch";
import { runBatchOcr } from "./mistral-batch";
import { runDirectOcrForCandidate } from "./mistral-direct";
import type { OcrCandidate, OcrRunResult } from "./types";

export async function runOcr(candidates: OcrCandidate[]): Promise<OcrRunResult> {
  const filteredCandidates = filterOcrCandidates(candidates);
  const mode = selectOcrMode(filteredCandidates.length);

  logger.info("[OCR_RUN] Starting OCR dispatch", {
    mode,
    candidateCount: filteredCandidates.length,
  });

  if (mode === "batch") {
    return {
      mode,
      results: await runBatchOcr(filteredCandidates),
    };
  }

  const results = await Promise.all(
    filteredCandidates.map((candidate) => runDirectOcrForCandidate(candidate))
  );
  return {
    mode,
    results,
  };
}
