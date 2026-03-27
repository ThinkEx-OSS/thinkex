function emitAudioProcessingComplete(detail: {
  itemId: string;
  error?: string;
  retrying?: boolean;
}) {
  window.dispatchEvent(
    new CustomEvent("audio-processing-complete", {
      detail,
    })
  );
}

export async function startAudioProcessing(params: {
  workspaceId: string;
  itemId: string;
  fileUrl: string;
  filename: string;
  mimeType: string;
}): Promise<void> {
  try {
    const res = await fetch("/api/audio/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileUrl: params.fileUrl,
        filename: params.filename,
        mimeType: params.mimeType,
        itemId: params.itemId,
        workspaceId: params.workspaceId,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.runId && data.itemId) {
      const { pollAudioProcessing } = await import(
        "@/lib/audio/poll-audio-processing"
      );
      await pollAudioProcessing(data.runId, data.itemId);
      return;
    }

    emitAudioProcessingComplete({
      itemId: params.itemId,
      error:
        (typeof data.error === "string" && data.error) ||
        res.statusText ||
        "Processing failed",
    });
  } catch (error) {
    emitAudioProcessingComplete({
      itemId: params.itemId,
      error: error instanceof Error ? error.message : "Processing failed",
    });
  }
}
