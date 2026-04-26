"use client";

import { Loader2, File, FileText, Brain, Mic, Globe } from "lucide-react";
import type { Item, PdfData, WebsiteData } from "@/lib/workspace-state/types";
import {
  getCardColorWithBlackMix,
  getIconColorFromCardColorWithOpacity,
  getLighterCardColor,
} from "@/lib/workspace-state/colors";

interface WorkspaceCardTypeBadgeProps {
  item: Item;
  resolvedTheme?: string;
}

export function WorkspaceCardTypeBadge({
  item,
  resolvedTheme,
}: WorkspaceCardTypeBadgeProps) {
  const showTypeBadge =
    item.type === "pdf" ||
    item.type === "quiz" ||
    item.type === "audio" ||
    item.type === "website" ||
    item.type === "document";

  if (!showTypeBadge) {
    return null;
  }

  return (
    <span
      className="absolute left-0 bottom-0 z-0 flex items-center gap-1.5 pl-2.5 pr-1.5 py-2 rounded-tr-md rounded-bl-md text-xs font-semibold uppercase tracking-wider w-max pointer-events-none"
      style={{
        backgroundColor: getIconColorFromCardColorWithOpacity(
          item.color,
          resolvedTheme === "dark",
          resolvedTheme === "dark" ? 0.3 : 0.55,
        ),
        color:
          resolvedTheme === "dark"
            ? getLighterCardColor(item.color, true, 0)
            : getCardColorWithBlackMix(item.color, 0.18),
      }}
    >
      {item.type === "pdf" ? (
        (item.data as PdfData)?.ocrStatus === "processing" ? (
          <>
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            <span>Reading...</span>
          </>
        ) : (
          <>
            <File className="h-5 w-5 shrink-0" />
            <span>PDF</span>
          </>
        )
      ) : item.type === "quiz" ? (
        <>
          <Brain className="h-5 w-5 shrink-0" />
          <span>Quiz</span>
        </>
      ) : item.type === "website" ? (
        (() => {
          const websiteData = item.data as WebsiteData;
          const favicon = websiteData.favicon;
          const fallbackId = `fallback-${item.id}`;
          const faviconId = `favicon-${item.id}`;

          return (
            <>
              {favicon && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  id={faviconId}
                  src={favicon}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded"
                  onLoad={(event) => {
                    if (event.currentTarget.naturalHeight === 16) {
                      event.currentTarget.style.display = "none";
                      const fallback = document.getElementById(fallbackId);
                      if (fallback) {
                        fallback.style.display = "flex";
                      }
                    }
                  }}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                    const fallback = document.getElementById(fallbackId);
                    if (fallback) {
                      fallback.style.display = "flex";
                    }
                  }}
                />
              )}
              <div
                id={fallbackId}
                className="h-5 w-5 shrink-0 flex items-center justify-center"
                style={{ display: favicon ? "none" : "flex" }}
              >
                <Globe className="h-5 w-5 shrink-0" />
              </div>
              <span>Website</span>
            </>
          );
        })()
      ) : item.type === "document" ? (
        <>
          <FileText className="h-5 w-5 shrink-0" />
          <span>DOC</span>
        </>
      ) : (
        <>
          <Mic className="h-5 w-5 shrink-0" />
          <span>Recording</span>
        </>
      )}
    </span>
  );
}
