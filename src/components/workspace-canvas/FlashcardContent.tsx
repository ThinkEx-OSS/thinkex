"use client";

import { useState, useEffect, useCallback } from "react";
import { PiCardsThreeBold } from "react-icons/pi";
import { Shuffle, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";
import type { FlashcardData, Item } from "@/lib/workspace-state/types";

interface FlashcardContentProps {
  item: Item;
  className?: string;
}

export function FlashcardContent({ item, className }: FlashcardContentProps) {
  const flashcardData = item.data as FlashcardData;
  const cards = flashcardData.cards || [];
  const totalCards = cards.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [isShuffleAnimating, setIsShuffleAnimating] = useState(false);
  const [hasFlipped, setHasFlipped] = useState(false);

  const actualIndex = isShuffled ? shuffledIndices[currentIndex] : currentIndex;
  const currentCard = cards[actualIndex];

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, totalCards]);

  const handleShuffle = useCallback(() => {
    if (isShuffled) {
      setIsShuffled(false);
      setShuffledIndices([]);
      setCurrentIndex(0);
      setIsFlipped(false);
    } else {
      const indices = Array.from({ length: cards.length }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      setIsShuffled(true);
      setShuffledIndices(indices);
      setCurrentIndex(0);
      setIsFlipped(false);
    }
    setIsShuffleAnimating(true);
    setTimeout(() => setIsShuffleAnimating(false), 500);
  }, [isShuffled, cards.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      )
        return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevious();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
        setHasFlipped(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handlePrevious, handleNext]);

  const preventFocusSteal = (e: React.MouseEvent) => e.preventDefault();
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  if (totalCards === 0) {
    return (
      <div
        className={cn(
          "flex flex-col h-full items-center justify-center p-4 text-center",
          className,
        )}
      >
        <PiCardsThreeBold className="size-8 rotate-180 text-muted-foreground mb-3" />
        <p className="text-foreground/60 text-sm">No flashcards yet</p>
        <p className="text-foreground/40 text-xs mt-1">
          Ask the AI to generate flashcards
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-4">
        <div
          className={cn(
            "mx-auto w-full max-w-lg [perspective:1200px]",
            "transition-all duration-200 ease-out",
            "hover:-translate-y-0.5",
          )}
        >
          <div
            className="cursor-pointer"
            onClick={() => {
              setIsFlipped((f) => !f);
              setHasFlipped(true);
            }}
          >
            <div
              className={cn(
                "relative w-full [transform-style:preserve-3d]",
                "transition-all duration-500 [transition-timing-function:cubic-bezier(0.4,0,0.2,1)]",
                isFlipped && "[transform:rotateY(180deg)]",
              )}
              style={{
                boxShadow: isFlipped
                  ? "0 8px 25px rgba(0,0,0,0.12)"
                  : "0 1px 3px rgba(0,0,0,0.08)",
                transform: isFlipped
                  ? "rotateY(180deg) scale(1.02)"
                  : "rotateY(0deg) scale(1)",
              }}
            >
              <div
                className={cn(
                  "[backface-visibility:hidden] rounded-xl border border-border/60 bg-card p-6",
                  "shadow-sm hover:shadow-md transition-shadow duration-300",
                  "min-h-[200px] overflow-y-auto",
                )}
              >
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Front
                </span>
                <div className="mt-3 text-sm text-foreground prose prose-sm max-w-none dark:text-foreground dark:prose-invert">
                  <StreamdownMarkdown>
                    {currentCard?.front || ""}
                  </StreamdownMarkdown>
                </div>
                {!hasFlipped && currentIndex === 0 && (
                  <p className="mt-4 text-xs text-muted-foreground/40">
                    Click to flip
                  </p>
                )}
              </div>
              <div
                className={cn(
                  "absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]",
                  "rounded-xl border border-border/60 bg-muted/30 p-6",
                  "shadow-sm",
                  "border-t-2 border-t-primary/20",
                  "min-h-[200px] overflow-y-auto",
                )}
              >
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Back
                </span>
                <div className="mt-3 text-sm text-foreground prose prose-sm max-w-none dark:text-foreground dark:prose-invert">
                  <StreamdownMarkdown>
                    {currentCard?.back || ""}
                  </StreamdownMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full max-w-lg mx-auto mt-4">
          <div className="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden dark:bg-foreground/10">
            <div
              className="h-full bg-gray-600 rounded-full transition-all duration-500 ease-out dark:bg-foreground"
              style={{
                width: `${((currentIndex + 1) / totalCards) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex-shrink-0">
        <div className="flex items-center w-full px-2">
          <div className="flex-1 flex items-center justify-start">
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                handleShuffle();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500/70 hover:text-gray-700 hover:bg-gray-100/50 transition-colors cursor-pointer dark:text-foreground/40 dark:hover:text-foreground dark:hover:bg-white/10"
            >
              <Shuffle
                className={cn(
                  "w-4 h-4 transition-transform duration-500",
                  isShuffleAnimating && "rotate-[360deg]",
                )}
              />
              <span>{isShuffled ? "Ordered" : "Shuffle"}</span>
            </button>
          </div>

          <div className="flex items-center gap-1 justify-center">
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                handlePrevious();
              }}
              disabled={currentIndex === 0}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer",
                currentIndex === 0
                  ? "text-gray-300 cursor-not-allowed dark:text-foreground/30"
                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-100/50 dark:text-foreground/70 dark:hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 px-1 dark:text-foreground/50">
              {currentIndex + 1} / {totalCards}
            </span>
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                handleNext();
              }}
              disabled={currentIndex >= totalCards - 1}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors cursor-pointer",
                currentIndex >= totalCards - 1
                  ? "text-gray-300 cursor-not-allowed dark:text-foreground/30"
                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-100/50 dark:text-foreground/70 dark:hover:text-foreground dark:hover:bg-white/10",
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-end">
            <button
              onMouseDown={preventFocusSteal}
              onClick={(e) => {
                stopPropagation(e);
                setIsFlipped((f) => !f);
                setHasFlipped(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500/70 hover:text-gray-700 hover:bg-gray-100/50 transition-colors cursor-pointer dark:text-foreground/40 dark:hover:text-foreground dark:hover:bg-white/10"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Flip</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlashcardContent;
