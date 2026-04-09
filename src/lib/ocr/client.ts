import { pollTask } from "@/lib/tasks/poll-task";
import type { OcrCandidate } from "./types";

const OCR_COMPLETE_EVENT = "ocr-processing-complete";
const POLL_INTERVAL_MS = 1_000;
const MAX_POLL_ATTEMPTS = 600;

interface OcrProcessingEventDetail {
  itemIds: string[];
  status: "completed" | "failed";
  error?: string;
}

function emitOcrProcessingComplete(detail: OcrProcessingEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OCR_COMPLETE_EVENT, { detail }));
}

export async function pollOcrRun(
  runId: string,
  itemIds: string[],
  signal?: AbortSignal,
): Promise<void> {
  const result = await pollTask({
    statusUrl: `/api/ocr/status?runId=${encodeURIComponent(runId)}`,
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    signal,
  });

  if (result.status === "completed") {
    emitOcrProcessingComplete({ itemIds, status: "completed" });
  } else {
    emitOcrProcessingComplete({
      itemIds,
      status: "failed",
      error: result.error ?? "OCR failed",
    });
  }
}

export async function startOcrProcessing(
  workspaceId: string,
  candidates: OcrCandidate[],
): Promise<void> {
  if (!workspaceId || candidates.length === 0) return;

  const res = await fetch("/api/ocr/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, candidates }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    emitOcrProcessingComplete({
      itemIds: candidates.map((c) => c.itemId),
      status: "failed",
      error: data.error || `Failed to start OCR: ${res.status}`,
    });
    throw new Error(data.error || "Failed to start OCR");
  }

  await pollOcrRun(
    data.runId,
    Array.isArray(data.itemIds)
      ? (data.itemIds as string[])
      : candidates.map((c) => c.itemId),
  );
}

export { OCR_COMPLETE_EVENT };
