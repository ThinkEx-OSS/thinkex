"use client";

import { Loader2, File, Brain, Mic } from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import type { Item, PdfData } from "@/lib/workspace-state/types";
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
    item.type === "flashcard" ||
    item.type === "quiz" ||
    item.type === "audio";

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
      ) : item.type === "flashcard" ? (
        <>
          <PiCardsThreeBold className="h-5 w-5 shrink-0" />
          <span>Flashcards</span>
        </>
      ) : item.type === "quiz" ? (
        <>
          <Brain className="h-5 w-5 shrink-0" />
          <span>Quiz</span>
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
