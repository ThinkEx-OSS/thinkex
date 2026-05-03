"use client";

import { useEffect, useRef, useState } from "react";
import { generatePdfThumbnail } from "@/lib/pdf/generate-pdf-thumbnail";
import { enqueuePdfThumbnailBackfill } from "@/lib/pdf/pdf-thumbnail-backfill";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import type { Item, PdfData } from "@/lib/workspace-state/types";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function usePdfThumbnailBackfill(params: {
  item: Item;
  pdfData: PdfData;
  onUpdateItem?: (itemId: string, updates: Partial<Item>) => void;
}) {
  const { item, pdfData, onUpdateItem } = params;
  const [isVisible, setIsVisible] = useState(false);
  const [isQueuedLocally, setIsQueuedLocally] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry?.isIntersecting ?? false);
      },
      {
        rootMargin: "240px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (pdfData.thumbnailUrl) {
      hasScheduledRef.current = true;
      setIsQueuedLocally(false);
      return;
    }

    if (
      !isVisible ||
      !pdfData.fileUrl ||
      !onUpdateItem ||
      hasScheduledRef.current
    ) {
      return;
    }

    const wasQueued = enqueuePdfThumbnailBackfill({
      itemId: item.id,
      run: async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const generatedThumbnail = await generatePdfThumbnail({
              filename: pdfData.filename || `${item.name || "document"}.pdf`,
              url: pdfData.fileUrl,
            });
            const thumbnailUpload = await uploadFileDirect(
              generatedThumbnail.file,
            );

            onUpdateItem(item.id, {
              data: {
                ...pdfData,
                thumbnailUrl: thumbnailUpload.url,
                thumbnailWidth: generatedThumbnail.width,
                thumbnailHeight: generatedThumbnail.height,
                thumbnailStatus: "ready",
              } satisfies PdfData,
            });
            setIsQueuedLocally(false);
            return;
          } catch (error) {
            if (attempt === 2) {
              onUpdateItem(item.id, {
                data: {
                  ...pdfData,
                  thumbnailStatus: "failed",
                } satisfies PdfData,
              });
              setIsQueuedLocally(false);
              throw error;
            }

            await wait(1200);
          }
        }
      },
    });

    if (!wasQueued) {
      return;
    }

    hasScheduledRef.current = true;
    setIsQueuedLocally(true);
    onUpdateItem(item.id, {
      data: {
        ...pdfData,
        thumbnailStatus: "pending",
      } satisfies PdfData,
    });
  }, [isVisible, item.id, item.name, onUpdateItem, pdfData]);

  return {
    containerRef,
    showPendingState: pdfData.thumbnailStatus === "pending" || isQueuedLocally,
  };
}
