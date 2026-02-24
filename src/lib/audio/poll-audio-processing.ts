const POLL_INTERVAL_MS = 10_000;

/**
 * Polls the audio processing status endpoint until the workflow completes or fails.
 * Dispatches audio-processing-complete when done.
 */
export async function pollAudioProcessing(runId: string, itemId: string): Promise<void> {
  const dispatchError = (error: string) => {
    window.dispatchEvent(
      new CustomEvent("audio-processing-complete", {
        detail: { itemId, error },
      })
    );
  };

  while (true) {
    try {
      const res = await fetch(`/api/audio/process/status?runId=${encodeURIComponent(runId)}`);
      if (!res.ok) {
        dispatchError(`Status check failed: ${res.status}`);
        return;
      }
      const data = await res.json();

      if (data.status === "completed") {
        window.dispatchEvent(
          new CustomEvent("audio-processing-complete", {
            detail: {
              itemId,
              summary: data.result.summary,
              segments: data.result.segments,
              duration: data.result.duration,
            },
          })
        );
        return;
      }

      if (data.status === "failed") {
        window.dispatchEvent(
          new CustomEvent("audio-processing-complete", {
            detail: {
              itemId,
              error: data.error || "Processing failed",
            },
          })
        );
        return;
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      dispatchError(
        err instanceof Error ? err.message : "Network or parse error during polling"
      );
      return;
    }
  }
}
