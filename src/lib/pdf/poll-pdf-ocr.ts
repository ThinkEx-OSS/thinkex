const POLL_INTERVAL_MS = 2000; // 2 seconds

/**
 * Polls the PDF OCR status endpoint until the workflow completes or fails.
 * Dispatches pdf-processing-complete when done.
 */
export async function pollPdfOcr(runId: string, itemId: string): Promise<void> {
  while (true) {
    const res = await fetch(
      `/api/pdf/ocr/status?runId=${encodeURIComponent(runId)}`
    );
    const data = await res.json();

    if (data.status === "completed") {
      window.dispatchEvent(
        new CustomEvent("pdf-processing-complete", {
          detail: {
            itemId,
            textContent: data.result?.textContent ?? "",
            ocrPages: data.result?.ocrPages ?? [],
            ocrStatus: "complete" as const,
          },
        })
      );
      return;
    }

    if (data.status === "failed") {
      window.dispatchEvent(
        new CustomEvent("pdf-processing-complete", {
          detail: {
            itemId,
            textContent: "",
            ocrPages: [],
            ocrStatus: "failed" as const,
            ocrError: data.error || "OCR failed",
          },
        })
      );
      return;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
