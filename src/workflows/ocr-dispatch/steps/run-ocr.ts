import { runOcr } from "@/lib/ocr/run";
import type { OcrCandidate, OcrRunResult } from "@/lib/ocr/types";

export async function executeOcrRun(
  candidates: OcrCandidate[]
): Promise<OcrRunResult> {
  "use step";

  return runOcr(candidates);
}
