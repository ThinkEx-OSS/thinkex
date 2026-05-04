"use client";

import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/tiptap-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EditorWordCountProps {
  editor: Editor | null;
  variant?: "floating" | "toolbar";
}

export function EditorWordCount({
  editor,
  variant = "floating",
}: EditorWordCountProps) {
  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;

      const storage = e.storage.characterCount;
      if (!storage) return null;

      const words = storage.words();
      const characters = storage.characters();

      const { from, to } = e.state.selection;
      const hasSelection = from !== to;
      let selectedWords = 0;
      let selectedChars = 0;

      if (hasSelection) {
        const selectedText = e.state.doc.textBetween(from, to, " ");
        selectedChars = e.state.doc.textBetween(from, to).length;
        selectedWords = selectedText.trim().split(/\s+/).filter(Boolean).length;
      }

      return { words, characters, hasSelection, selectedWords, selectedChars };
    },
  });

  if (!counts) return null;

  const { words, characters, hasSelection, selectedWords, selectedChars } = counts;

  if (variant === "toolbar") {
    const wordLabel = hasSelection
      ? `${selectedWords}/${words} words`
      : `${words} words`;
    const charLabel = hasSelection
      ? `${selectedChars}/${characters} chars`
      : `${characters} chars`;

    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="ml-auto h-6.5 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Word count"
          >
            {wordLabel}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="end"
          sideOffset={6}
          className="px-2.5 py-1.5 text-[11px] font-medium tabular-nums"
        >
          <div className="whitespace-nowrap">{charLabel}</div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      className={cn(
        "group/wc pointer-events-auto sticky bottom-4 mr-auto ml-4 z-30 w-fit",
        "flex items-center gap-1.5 rounded-md px-2 py-1",
        "bg-background/80 backdrop-blur-sm border border-transparent",
        "text-[11px] tabular-nums text-muted-foreground/50",
        "transition-all duration-200 select-none",
        "hover:text-muted-foreground/90 hover:border-border/50 hover:shadow-sm",
      )}
    >
      {hasSelection ? (
        <>
          <span>{selectedWords} of {words} words</span>
          <span className="hidden group-hover/wc:inline">
            &middot; {selectedChars} of {characters} chars
          </span>
        </>
      ) : (
        <>
          <span>{words} {words === 1 ? "word" : "words"}</span>
          <span className="hidden group-hover/wc:inline">
            &middot; {characters} {characters === 1 ? "char" : "chars"}
          </span>
        </>
      )}
    </div>
  );
}
