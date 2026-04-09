import { pollTask } from "@/lib/tasks/poll-task";

const AUDIO_COMPLETE_EVENT = "audio-processing-complete";
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 120;

/**
 * Polls the audio processing status endpoint until the workflow completes or fails.
 * Dispatches audio-processing-complete when done.
 */
export async function pollAudioProcessing(
  runId: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<void> {
  const dispatchComplete = (detail: Record<string, unknown>) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(AUDIO_COMPLETE_EVENT, { detail: { itemId, ...detail } }),
    );
  };

  const result = await pollTask({
    statusUrl: `/api/audio/process/status?runId=${encodeURIComponent(runId)}`,
    intervalMs: POLL_INTERVAL_MS,
    maxAttempts: MAX_POLL_ATTEMPTS,
    signal,
  });

  if (result.status === "completed" && result.data) {
    const resultData = result.data.result as
      | { summary?: string; segments?: unknown[]; duration?: number }
      | undefined;
    dispatchComplete({
      summary: resultData?.summary,
      segments: resultData?.segments,
      duration: resultData?.duration,
    });
  } else {
    dispatchComplete({ error: result.error ?? "Processing failed" });
  }
}

export { AUDIO_COMPLETE_EVENT };
