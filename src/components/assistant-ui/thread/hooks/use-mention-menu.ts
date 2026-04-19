"use client";

import {
  useCallback,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ComposerActions } from "@/lib/chat/runtime";
import type { Item } from "@/lib/workspace-state/types";

interface UseMentionMenuArgs {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  promptInput: ComposerActions | null;
  onSelectItem: (item: Item) => void;
}

interface UseMentionMenuResult {
  mentionMenuOpen: boolean;
  mentionQuery: string;
  handleInput: (e: FormEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleMentionMenuClose: (open: boolean) => void;
  handleMentionSelect: (item: Item) => void;
}

export function useMentionMenu({
  inputRef,
  promptInput,
  onSelectItem,
}: UseMentionMenuArgs): UseMentionMenuResult {
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(
    null,
  );

  const handleInput = useCallback(
    (e: FormEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      const value = textarea.value;
      const cursorPos = textarea.selectionStart ?? 0;

      if (mentionStartIndex !== null) {
        const query = value.slice(mentionStartIndex + 1, cursorPos);

        if (
          cursorPos <= mentionStartIndex ||
          query.includes(" ") ||
          query.includes("\n")
        ) {
          setMentionMenuOpen(false);
          setMentionStartIndex(null);
          setMentionQuery("");
        } else {
          setMentionQuery(query);
        }
      }
    },
    [mentionStartIndex],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;

      if (e.key === "@" && !mentionMenuOpen) {
        const cursorPos = textarea.selectionStart ?? 0;
        const charBefore = cursorPos > 0 ? textarea.value[cursorPos - 1] : " ";
        if (charBefore === " " || charBefore === "\n" || cursorPos === 0) {
          setMentionMenuOpen(true);
          setMentionStartIndex(cursorPos);
          setMentionQuery("");
        }
      }

      if (e.key === "Escape" && mentionMenuOpen) {
        e.preventDefault();
        setMentionMenuOpen(false);
        setMentionStartIndex(null);
        setMentionQuery("");
      }

      if (
        mentionMenuOpen &&
        ["ArrowUp", "ArrowDown", "Enter"].includes(e.key)
      ) {
        e.preventDefault();
      }
    },
    [mentionMenuOpen],
  );

  const clearMentionQuery = useCallback(() => {
    if (mentionStartIndex !== null && inputRef.current) {
      const textarea = inputRef.current;
      const currentValue = textarea.value;
      const atSymbolIndex = mentionStartIndex;

      let queryEndIndex = mentionStartIndex;
      while (
        queryEndIndex < currentValue.length &&
        currentValue[queryEndIndex] !== " " &&
        currentValue[queryEndIndex] !== "\n"
      ) {
        queryEndIndex++;
      }

      const textBefore = currentValue.substring(0, atSymbolIndex);
      const textAfter = currentValue.substring(queryEndIndex);
      const newValue = textBefore + textAfter;

      promptInput?.setText(newValue);
      setMentionQuery("");
      setMentionStartIndex(null);

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = textBefore.length;
          inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  }, [inputRef, mentionStartIndex, promptInput]);

  const handleMentionSelect = useCallback(
    (item: Item) => {
      onSelectItem(item);
    },
    [onSelectItem],
  );

  const handleMentionMenuClose = useCallback(
    (open: boolean) => {
      if (!open) {
        clearMentionQuery();
      }
      setMentionMenuOpen(open);
    },
    [clearMentionQuery],
  );

  return {
    mentionMenuOpen,
    mentionQuery,
    handleInput,
    handleKeyDown,
    handleMentionMenuClose,
    handleMentionSelect,
  };
}
