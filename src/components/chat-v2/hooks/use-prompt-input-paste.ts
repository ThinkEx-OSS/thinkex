"use client";

import { useCallback, type ClipboardEvent } from "react";

interface UsePromptInputPasteArgs {
  addFiles: (files: File[]) => Promise<void>;
}

export function usePromptInputPaste({ addFiles }: UsePromptInputPasteArgs) {
  return useCallback(async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const files = Array.from(clipboardData.files);
    if (files.length > 0) {
      event.preventDefault();
      await addFiles(files);
      return;
    }

    const imageItem = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      await addFiles([file]);
    }
  }, [addFiles]);
}
