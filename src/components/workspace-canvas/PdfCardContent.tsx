"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { FileText, Loader2 } from "lucide-react";
import { generatePdfThumbnail } from "@/lib/pdf/generate-pdf-thumbnail";
import { enqueuePdfThumbnailBackfill } from "@/lib/pdf/pdf-thumbnail-backfill";
import { uploadFileDirect } from "@/lib/uploads/client-upload";
import type { Item, PdfData } from "@/lib/workspace-state/types";

interface PdfCardContentProps {
  item: Item;
  onUpdateItem?: (itemId: string, updates: Partial<Item>) => void;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function PdfCardContent({ item, onUpdateItem }: PdfCardContentProps) {
  const pdfData = item.data as PdfData;
  const thumbnailUrl = pdfData.thumbnailUrl;
  const fileUrl = pdfData.fileUrl;
  const isPending = pdfData.thumbnailStatus === "pending";
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
    if (thumbnailUrl) {
      hasScheduledRef.current = true;
      setIsQueuedLocally(false);
      return;
    }

    if (!isVisible || !fileUrl || !onUpdateItem || hasScheduledRef.current) {
      return;
    }

    const nextData = {
      ...pdfData,
      thumbnailStatus: "pending",
    } satisfies PdfData;

    const wasQueued = enqueuePdfThumbnailBackfill({
      itemId: item.id,
      run: async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const generatedThumbnail = await generatePdfThumbnail({
              filename: pdfData.filename || `${item.name || "document"}.pdf`,
              url: fileUrl,
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
    onUpdateItem(item.id, { data: nextData });
  }, [fileUrl, isVisible, item.id, item.name, onUpdateItem, pdfData, thumbnailUrl]);

  const showPendingState = isPending || isQueuedLocally;

  if (thumbnailUrl) {
    return (
      <div
        ref={containerRef}
        className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-md bg-black/5 dark:bg-white/5"
      >
        <Image
          src={thumbnailUrl}
          alt={item.name || pdfData.filename || "PDF preview"}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover object-top"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md px-4 text-center"
    >
      <div className="flex h-10 w-10 items-center justify-center text-muted-foreground">
        {showPendingState ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileText className="h-5 w-5" />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {showPendingState ? "Generating preview..." : "Preview unavailable"}
      </p>
    </div>
  );
}

export default PdfCardContent;
