import type { OcrCandidate } from "./types";

const OCR_COMPLETE_EVENT = "ocr-processing-complete";
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_MS = 10 * 60 * 1000;
const MAX_POLL_ATTEMPTS = Math.ceil(MAX_POLL_MS / POLL_INTERVAL_MS);

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
  signal?: AbortSignal
): Promise<void> {
  const emitFailure = (error: string) => {
    emitOcrProcessingComplete({
      itemIds,
      status: "failed",
      error,
    });
  };

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    if (signal?.aborted) {
      emitFailure("OCR polling canceled");
      return;
    }

    let res: Response;
    let data: { status?: string; error?: string };

    try {
      res = await fetch(`/api/ocr/status?runId=${encodeURIComponent(runId)}`, {
        signal,
      });
      data = (await res.json().catch(() => {
        throw new Error("Failed to parse OCR status response");
      })) as { status?: string; error?: string };
    } catch (error) {
      const aborted =
        signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      emitFailure(
        aborted
          ? "OCR polling canceled"
          : error instanceof Error
            ? error.message
            : "Failed to poll OCR status"
      );
      return;
    }

    if (data.status === "not_found" || res.status === 404) {
      emitFailure(data.error ?? "OCR run not found or expired");
      return;
    }

    if (!res.ok) {
      emitFailure(data.error || `Failed to fetch OCR status: ${res.status}`);
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
      emitFailure(data.error || "OCR failed");
      return;
    }

    await new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        signal?.removeEventListener("abort", handleAbort);
        resolve();
      }, POLL_INTERVAL_MS);

      const handleAbort = () => {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener("abort", handleAbort);
        resolve();
      };

      signal?.addEventListener("abort", handleAbort, { once: true });
    });
  }

  emitFailure(`OCR status polling timed out after ${MAX_POLL_MS / 1000} seconds`);
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
