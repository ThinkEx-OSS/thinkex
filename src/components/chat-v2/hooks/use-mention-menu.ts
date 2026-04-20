"use client";

import { useCallback, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import type { Item } from "@/lib/workspace-state/types";

interface UseMentionMenuArgs {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  setInput: (value: string) => void;
  onSelectItem: (item: Item) => void;
}

export function useMentionMenu({ inputRef, setInput, onSelectItem }: UseMentionMenuArgs) {
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    const value = textarea.value;
    const cursorPos = textarea.selectionStart ?? 0;
    if (mentionStartIndex === null) return;
    const query = value.slice(mentionStartIndex + 1, cursorPos);
    if (cursorPos <= mentionStartIndex || query.includes(" ") || query.includes("\n")) {
      setMentionMenuOpen(false);
      setMentionStartIndex(null);
      setMentionQuery("");
      return;
    }
    setMentionQuery(query);
  }, [mentionStartIndex]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = event.currentTarget;
    if (event.key === "@" && !mentionMenuOpen) {
      const cursorPos = textarea.selectionStart ?? 0;
      const charBefore = cursorPos > 0 ? textarea.value[cursorPos - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || cursorPos === 0) {
        setMentionMenuOpen(true);
        setMentionStartIndex(cursorPos);
        setMentionQuery("");
      }
    }

    if (event.key === "Escape" && mentionMenuOpen) {
      event.preventDefault();
      setMentionMenuOpen(false);
      setMentionStartIndex(null);
      setMentionQuery("");
    }

    if (mentionMenuOpen && ["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
      event.preventDefault();
    }
  }, [mentionMenuOpen]);

  const clearMentionQuery = useCallback(() => {
    if (mentionStartIndex === null || !inputRef.current) return;
    const textarea = inputRef.current;
    const currentValue = textarea.value;
    let queryEndIndex = mentionStartIndex;
    while (queryEndIndex < currentValue.length && currentValue[queryEndIndex] !== " " && currentValue[queryEndIndex] !== "\n") {
      queryEndIndex += 1;
    }
    const textBefore = currentValue.substring(0, mentionStartIndex);
    const textAfter = currentValue.substring(queryEndIndex);
    setInput(textBefore + textAfter);
    setMentionMenuOpen(false);
    setMentionStartIndex(null);
    setMentionQuery("");
    queueMicrotask(() => {
      const next = inputRef.current;
      if (!next) return;
      next.focus();
      next.setSelectionRange(textBefore.length, textBefore.length);
    });
  }, [inputRef, mentionStartIndex, setInput]);

  return {
    mentionMenuOpen,
    mentionQuery,
    handleInput,
    handleKeyDown,
    handleMentionMenuClose: (open: boolean) => {
      if (!open) clearMentionQuery();
      setMentionMenuOpen(open);
    },
    handleMentionSelect: (item: Item) => onSelectItem(item),
  };
}
