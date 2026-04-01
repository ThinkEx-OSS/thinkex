"use client";

import { useMemo } from "react";
import type {
  Item,
  ItemData,
  FlashcardData,
  FlashcardItem,
} from "@/lib/workspace-state/types";
import { PreviewBlock } from "@/components/editor/BlockNotePreview";
import {
  plainTextToBlocks,
  type Block,
} from "@/components/editor/blocknote-shared";

interface FlashcardContentProps {
  item: Item;
  onUpdateData: (updater: (prev: ItemData) => ItemData) => void;
}

function getBlocks(blocks?: Block[] | null, fallbackText?: string): Block[] {
  if (blocks && Array.isArray(blocks) && blocks.length > 0) {
    return blocks as Block[];
  }

  return plainTextToBlocks(fallbackText || "");
}

function renderSide(blocks: Block[], emptyLabel: string) {
  if (blocks.length === 0) {
    return (
      <div className="text-sm text-foreground/40 dark:text-white/40">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="relative min-h-[160px] space-y-2 p-3">
      {blocks.map((block, index, allBlocks) => (
        <PreviewBlock
          key={(block as { id?: string }).id || index}
          block={block}
          index={index}
          blocks={allBlocks}
          isScrollLocked={false}
        />
      ))}
    </div>
  );
}

function FlashcardSidePreview({
  title,
  blocks,
  emptyLabel,
}: {
  title: string;
  blocks: Block[];
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
        {renderSide(blocks, emptyLabel)}
      </div>
    </div>
  );
}

export function FlashcardContent({ item }: FlashcardContentProps) {
  const flashcardData = item.data as FlashcardData;

  const cards = useMemo(() => {
    if (flashcardData.cards && flashcardData.cards.length > 0) {
      return flashcardData.cards;
    }

    if (
      flashcardData.front ||
      (Array.isArray(flashcardData.frontBlocks) &&
        flashcardData.frontBlocks.length > 0) ||
      flashcardData.back ||
      (Array.isArray(flashcardData.backBlocks) &&
        flashcardData.backBlocks.length > 0)
    ) {
      return [
        {
          id: item.id,
          front: flashcardData.front || "",
          back: flashcardData.back || "",
          frontBlocks: flashcardData.frontBlocks || [],
          backBlocks: flashcardData.backBlocks || [],
        } as FlashcardItem,
      ];
    }

    return [];
  }, [
    flashcardData.back,
    flashcardData.backBlocks,
    flashcardData.cards,
    flashcardData.front,
    flashcardData.frontBlocks,
    item.id,
  ]);

  return (
    <div className="flex-1 overflow-y-auto modal-scrollable">
      <div className="max-w-5xl mx-auto p-6 pb-24">
        {cards.length === 0 ? (
          <div className="rounded-2xl border border-foreground/10 bg-foreground/5/50 p-5 text-sm text-foreground/50 shadow-inner dark:border-white/10 dark:bg-white/5/50 dark:text-white/50">
            No flashcards available.
          </div>
        ) : (
          <div className="space-y-6">
            {cards.map((card, index) => {
              const frontBlocks = getBlocks(
                card.frontBlocks as Block[] | undefined,
                card.front,
              );
              const backBlocks = getBlocks(
                card.backBlocks as Block[] | undefined,
                card.back,
              );

              return (
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
                      blocks={frontBlocks}
                      emptyLabel="No front content"
                    />

                    <FlashcardSidePreview
                      title="Back"
                      blocks={backBlocks}
                      emptyLabel="No back content"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default FlashcardContent;
