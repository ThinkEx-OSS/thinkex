"use client";

import { AsyncQueuer } from "@tanstack/pacer";

type PdfThumbnailBackfillJob = {
  itemId: string;
  run: () => Promise<void>;
};

const queuedIds = new Set<string>();
const activeIds = new Set<string>();

const pdfThumbnailBackfillQueuer = new AsyncQueuer<PdfThumbnailBackfillJob>(
  async (job) => {
    queuedIds.delete(job.itemId);
    activeIds.add(job.itemId);

    try {
      await job.run();
    } finally {
      activeIds.delete(job.itemId);
    }
  },
  {
    concurrency: 2,
    started: true,
    onError: (error, job) => {
      console.error(
        `PDF thumbnail backfill failed for item "${job.itemId}":`,
        error,
      );
    },
  },
);

export function enqueuePdfThumbnailBackfill(
  job: PdfThumbnailBackfillJob,
): boolean {
  if (queuedIds.has(job.itemId) || activeIds.has(job.itemId)) {
    return false;
  }

  queuedIds.add(job.itemId);
  const wasAdded = pdfThumbnailBackfillQueuer.addItem(job);

  if (!wasAdded) {
    queuedIds.delete(job.itemId);
    return false;
  }

  return true;
}
