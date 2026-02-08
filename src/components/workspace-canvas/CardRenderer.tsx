"use client";

import { useUIStore } from "@/lib/stores/ui-store";
import type { Item, ItemData, NoteData, PdfData, FlashcardData, YouTubeData, ImageData } from "@/lib/workspace-state/types";
import { useMemo, useState } from "react";
import { DynamicBlockNoteEditor } from "@/components/editor/DynamicBlockNoteEditor";
import { plainTextToBlocks, type Block } from "@/components/editor/BlockNoteEditor";
import FlashcardContent from "./FlashcardContent";
import YouTubeCardContent from "./YouTubeCardContent";
import { SourcesDisplay } from "./SourcesDisplay";
import ImageCardContent from "./ImageCardContent";

import { QuizContent } from "./QuizContent";

export function CardRenderer(props: {
  item: Item;
  onUpdateData: (updater: (prev: ItemData) => ItemData) => void;

  layoutKey?: string | number;
}) {
  const { item, onUpdateData } = props;

  const playingYouTubeCardIds = useUIStore(state => state.playingYouTubeCardIds);
  const setCardPlaying = useUIStore(state => state.setCardPlaying);
  const isYouTubePlaying = playingYouTubeCardIds.has(item.id);

  if (item.type === "note") {
    const noteData = item.data as NoteData;

    const blocksToPlainText = (blocks: Block[]): string => {
      if (!blocks || blocks.length === 0) return "";
      return blocks
        .map((block) => {
          const blockData = block as { content?: Array<{ text?: string }> };
          if (blockData.content && Array.isArray(blockData.content)) {
            return blockData.content
              .map((item) => item.text || "")
              .join("");
          }
          return "";
        })
        .join("\n");
    };

    const initialBlocks = useMemo(() => {
      // Check for block content from updated data or fallback to field1
      if (noteData.blockContent) {
        return noteData.blockContent as unknown as Block[];
      }
      return [{
        type: "paragraph",
        content: [{ type: "text", text: noteData.field1 || "", styles: {} }]
      }] as unknown as Block[];
    }, [noteData.blockContent, noteData.field1, item.id, item.lastSource]);
    return (
      <>
        <DynamicBlockNoteEditor
          key={item.id}
          initialContent={initialBlocks}
          cardName={item.name}
          cardId={item.id}
          lastSource={item.lastSource}
          autofocus={true}
          onChange={(blocks) => {
            onUpdateData(() => ({
              blockContent: blocks,
              field1: blocksToPlainText(blocks),
            }));
          }}
        />
        {/* Sources section - only shown if sources exist */}
        {noteData.sources && noteData.sources.length > 0 && (
          <div className="px-4 pb-3 mt-2">
            <SourcesDisplay sources={noteData.sources} />
          </div>
        )}
      </>
    );
  }

  if (item.type === "pdf") {
    const pdfData = item.data as PdfData;
    return (
      <div className="mt-4 p-4 rounded-lg bg-muted/30 text-center">
        <p className="text-sm text-muted-foreground">
          PDF: {pdfData.filename || 'Document'}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-2">
          Use the PDF viewer to read this document
        </p>
      </div>
    );
  }

  if (item.type === "flashcard") {
    return <FlashcardContent item={item} onUpdateData={onUpdateData} />;
  }

  if (item.type === "quiz") {
    return <QuizContent item={item} onUpdateData={onUpdateData} />;
  }

  if (item.type === "youtube") {
    return (
      <YouTubeCardContent
        item={item}
        isPlaying={isYouTubePlaying}
        onTogglePlay={(playing) => setCardPlaying(item.id, playing)}
      />
    );
  }

  if (item.type === "image") {
    return <ImageCardContent item={item} />;
  }

  return (
    <div className="mt-4 p-4 rounded-lg bg-muted/30 text-center">
      <p className="text-sm text-muted-foreground">
        Unknown card type: {item.type}
      </p>
    </div>
  );
}

export default CardRenderer;