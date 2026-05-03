"use client";

import Image from "next/image";
import { FileText, Loader2 } from "lucide-react";
import type { Item, PdfData } from "@/lib/workspace-state/types";
import { usePdfThumbnailBackfill } from "./usePdfThumbnailBackfill";

interface PdfCardContentProps {
  item: Item;
  onUpdateItem?: (itemId: string, updates: Partial<Item>) => void;
}

export function PdfCardContent({ item, onUpdateItem }: PdfCardContentProps) {
  const pdfData = item.data as PdfData;
  const { containerRef, showPendingState } = usePdfThumbnailBackfill({
    item,
    pdfData,
    onUpdateItem,
  });

  if (pdfData.thumbnailUrl) {
    return (
      <div
        ref={containerRef}
        className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-md bg-black/5 dark:bg-white/5"
      >
        <Image
          src={pdfData.thumbnailUrl}
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
