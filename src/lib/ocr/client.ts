import type { OcrCandidate } from "./types";

const OCR_COMPLETE_EVENT = "ocr-processing-complete";
const POLL_INTERVAL_MS = 1000;

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
  itemIds: string[]
): Promise<void> {
  while (true) {
    const res = await fetch(`/api/ocr/status?runId=${encodeURIComponent(runId)}`);
    const data = await res.json();

    if (data.status === "not_found" || res.status === 404) {
      emitOcrProcessingComplete({
        itemIds,
        status: "failed",
        error: data.error ?? "OCR run not found or expired",
      });
      return;
    }

    if (data.status === "completed") {
      emitOcrProcessingComplete({
        itemIds,
        status: "completed",
      });
      return;
    }

    if (data.status === "failed") {
      emitOcrProcessingComplete({
        itemIds,
        status: "failed",
        error: data.error || "OCR failed",
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export async function startOcrProcessing(
  workspaceId: string,
  candidates: OcrCandidate[]
): Promise<void> {
  if (!workspaceId || candidates.length === 0) return;

  const res = await fetch("/api/ocr/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      candidates,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    emitOcrProcessingComplete({
      itemIds: candidates.map((candidate) => candidate.itemId),
      status: "failed",
      error: data.error || `Failed to start OCR: ${res.status}`,
    });
    throw new Error(data.error || "Failed to start OCR");
  }

  await pollOcrRun(
    data.runId,
    Array.isArray(data.itemIds)
      ? (data.itemIds as string[])
      : candidates.map((candidate) => candidate.itemId)
  );
}

export { OCR_COMPLETE_EVENT };
