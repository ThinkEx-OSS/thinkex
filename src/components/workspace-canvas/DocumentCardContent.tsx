"use client";

import { useMemo } from "react";
import type { DocumentData, Item } from "@/lib/workspace-state/types";
import { extractDocumentPreview } from "@/lib/markdown/extract-document-preview";

interface DocumentCardContentProps {
  item: Item;
}

export function DocumentCardContent({ item }: DocumentCardContentProps) {
  const documentData = item.data as DocumentData;
  const previewText = useMemo(
    () => extractDocumentPreview(documentData.markdown ?? ""),
    [documentData.markdown],
  );

  const hasPreview = previewText.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1">
      {hasPreview ? (
        <p className="whitespace-pre-line break-words text-[11px] leading-4 text-foreground/60 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:10] overflow-hidden">
          {previewText}
        </p>
      ) : (
        <p className="text-[11px] leading-4 text-muted-foreground">
          Empty document
        </p>
      )}
    </div>
  );
}

export default DocumentCardContent;
