"use client";

import { useMemo } from "react";
import type {
  Item,
  FlashcardData,
} from "@/lib/workspace-state/types";
import { StreamdownMarkdown } from "@/components/ui/streamdown-markdown";

interface FlashcardContentProps {
  item: Item;
}

function FlashcardSidePreview({
  title,
  markdown,
  emptyLabel,
}: {
  title: string;
  markdown: string;
  emptyLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 block text-sm font-medium text-foreground/70 dark:text-white/70">
        {title}
      </div>
      <div
        className="rounded-lg border border-foreground/10 bg-foreground/5 min-h-[150px] overflow-hidden dark:border-white/10 dark:bg-white/5"
        style={{ backdropFilter: "blur(8px)" }}
      >
        {!markdown.trim() ? (
          <div className="p-3 text-sm text-foreground/40 dark:text-white/40">
            {emptyLabel}
          </div>
        ) : (
          <div className="relative min-h-[160px] space-y-2 p-3 text-sm leading-6">
            <StreamdownMarkdown className="text-sm leading-6 text-foreground dark:text-white">
              {markdown}
            </StreamdownMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}

export function FlashcardContent({ item }: FlashcardContentProps) {
  const flashcardData = item.data as FlashcardData;
  const cards = useMemo(() => flashcardData.cards ?? [], [flashcardData.cards]);

  return (
    <div className="flex-1 overflow-y-auto modal-scrollable">
      <div className="max-w-5xl mx-auto p-6 pb-24">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5/50 p-5 text-sm text-foreground/50 shadow-inner dark:border-white/10 dark:bg-white/5/50 dark:text-white/50">
            No flashcards available.
          </div>
        ) : (
          <div className="space-y-6">
            {cards.map((card, index) => (
              <div
                key={card.id}
                className="relative rounded-2xl border border-foreground/10 bg-foreground/5/50 p-5 shadow-inner dark:border-white/10 dark:bg-white/5/50"
                style={{ backdropFilter: "blur(8px)" }}
              >
                <div className="absolute -top-3 -left-3">
                  <div className="flex h-8 min-w-[2.2rem] items-center justify-center rounded-full bg-black/70 px-2 text-xs font-semibold text-foreground shadow-md dark:text-white">
                    #{index + 1}
                  </div>
                </div>

                <div className="space-y-6">
                  <FlashcardSidePreview
                    title="Front"
                    markdown={card.front}
                    emptyLabel="No front content"
                  />

                  <FlashcardSidePreview
                    title="Back"
                    markdown={card.back}
                    emptyLabel="No back content"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FlashcardContent;
