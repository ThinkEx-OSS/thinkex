"use client";

import { PiCardsThreeBold } from "react-icons/pi";
import type { Item } from "@/lib/workspace-state/types";

interface FlashcardContentProps {
  item: Item;
}

export function FlashcardContent({ item }: FlashcardContentProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 px-6 py-8 text-center">
        <PiCardsThreeBold className="size-8 rotate-180 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">
            {item.name || "Flashcards"}
          </p>
          <p className="text-sm text-muted-foreground">
            Flashcards are coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}

export default FlashcardContent;
