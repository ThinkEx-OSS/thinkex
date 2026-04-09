import type { TaskStatus } from "./task-types";

const TERMINAL_STATUSES: Set<TaskStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "not_found",
]);

export interface PollTaskOptions {
  statusUrl: string;
  intervalMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  onStatus?: (status: TaskStatus, data: Record<string, unknown>) => void;
}

export interface PollTaskResult {
  status: TaskStatus;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * Generic polling loop for long-running task status endpoints.
 * Returns when the task reaches a terminal status or polling is aborted/exhausted.
 */
export async function pollTask(opts: PollTaskOptions): Promise<PollTaskResult> {
  const {
    statusUrl,
    intervalMs = 2_000,
    maxAttempts = 300,
    signal,
    onStatus,
  } = opts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) {
      return { status: "cancelled", error: "Polling aborted" };
    }

    let data: Record<string, unknown>;

    try {
      const res = await fetch(statusUrl, { signal });
      if (!res.ok) {
        return {
          status: "failed",
          error: `Status check failed: ${res.status}`,
        };
      }
      data = (await res.json()) as Record<string, unknown>;
    } catch (err) {
      const aborted =
        signal?.aborted ||
        (err instanceof DOMException && err.name === "AbortError");
      return {
        status: aborted ? "cancelled" : "failed",
        error: aborted
          ? "Polling aborted"
          : err instanceof Error
            ? err.message
            : "Network error during polling",
      };
    }

    const status = data.status as TaskStatus;
    onStatus?.(status, data);

    if (TERMINAL_STATUSES.has(status)) {
      return {
        status,
        error: typeof data.error === "string" ? data.error : undefined,
        data,
      };
    }

    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener("abort", handleAbort);
        resolve();
      }, intervalMs);

      const handleAbort = () => {
        clearTimeout(timeoutId);
        signal?.removeEventListener("abort", handleAbort);
        resolve();
      };

      signal?.addEventListener("abort", handleAbort, { once: true });
    });
  }

  return {
    status: "failed",
    error: `Polling timed out after ${maxAttempts} attempts`,
  };
}
