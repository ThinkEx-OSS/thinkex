"use client";

import Image from "next/image";
import { FileText, Loader2 } from "lucide-react";
import type { Item, PdfData } from "@/lib/workspace-state/types";

interface PdfCardContentProps {
  item: Item;
}

export function PdfCardContent({ item }: PdfCardContentProps) {
  const pdfData = item.data as PdfData;
  const thumbnailUrl = pdfData.thumbnailUrl;
  const isPending = pdfData.thumbnailStatus === "pending";

  if (thumbnailUrl) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
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
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-md px-4 text-center">
      <div className="flex h-10 w-10 items-center justify-center text-muted-foreground">
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileText className="h-5 w-5" />
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {isPending ? "Generating preview..." : "Preview unavailable"}
      </p>
    </div>
  );
}

export default PdfCardContent;
