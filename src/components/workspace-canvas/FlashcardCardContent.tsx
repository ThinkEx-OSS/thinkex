"use client";

import { PiCardsThreeBold } from "react-icons/pi";
import type { FlashcardData, Item } from "@/lib/workspace-state/types";

interface FlashcardCardContentProps {
  item: Item;
}

export function FlashcardCardContent({ item }: FlashcardCardContentProps) {
  const flashcardData = item.data as FlashcardData;
  const cardCount = flashcardData.cards?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md px-4 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground">
        <PiCardsThreeBold className="h-5 w-5 rotate-180" />
      </div>
      <p className="text-sm text-muted-foreground">
        {cardCount} card{cardCount === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export default FlashcardCardContent;
