import { sleep } from "workflow";
import { logger } from "@/lib/utils/logger";
import type { OcrCandidate } from "@/lib/ocr/types";
import { executeOcrRun } from "./steps/run-ocr";
import { persistOcrResults } from "./steps/persist-results";

const OCR_TIMEOUT = "10min";

export async function ocrDispatchWorkflow(
  candidates: OcrCandidate[],
  workspaceId: string,
  userId: string
) {
  "use workflow";

  const startedAt = Date.now();
  logger.info("[OCR_DISPATCH_WORKFLOW] Workflow start", {
    workspaceId,
    userId,
    candidateCount: candidates.length,
    timeout: OCR_TIMEOUT,
  });

  try {
    const runResult = await Promise.race([
      executeOcrRun(candidates),
      sleep(OCR_TIMEOUT).then(() => ({ timedOut: true } as const)),
    ]);

    if ("timedOut" in runResult) {
      logger.warn("[OCR_DISPATCH_WORKFLOW] Workflow timed out", {
        workspaceId,
        candidateCount: candidates.length,
        totalMs: Date.now() - startedAt,
      });

      await persistOcrResults(
        workspaceId,
        userId,
        candidates.map((candidate) => ({
          itemId: candidate.itemId,
          itemType: candidate.itemType,
          ok: false as const,
          error: `OCR timed out after ${OCR_TIMEOUT}`,
        }))
      );

      return {
        mode: "direct" as const,
        completedCount: 0,
        failedCount: candidates.length,
      };
    }

    await persistOcrResults(workspaceId, userId, runResult.results);

    logger.info("[OCR_DISPATCH_WORKFLOW] Workflow complete", {
      workspaceId,
      mode: runResult.mode,
      candidateCount: candidates.length,
      failedCount: runResult.results.filter((result) => !result.ok).length,
      totalMs: Date.now() - startedAt,
    });

    return {
      mode: runResult.mode,
      completedCount: runResult.results.filter((result) => result.ok).length,
      failedCount: runResult.results.filter((result) => !result.ok).length,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "OCR dispatch failed";

    logger.error("[OCR_DISPATCH_WORKFLOW] Workflow failed", {
      workspaceId,
      candidateCount: candidates.length,
      totalMs: Date.now() - startedAt,
      errorMessage,
    });

    await persistOcrResults(
      workspaceId,
      userId,
      candidates.map((candidate) => ({
        itemId: candidate.itemId,
        itemType: candidate.itemType,
        ok: false as const,
        error: errorMessage,
      }))
    );

    throw error;
  }
}
