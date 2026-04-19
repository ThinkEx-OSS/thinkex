"use client";

import type { ClipboardEvent } from "react";
import type { ComposerActions } from "@/lib/chat/runtime";

interface UsePromptInputPasteArgs {
  promptInput: ComposerActions | null;
  workspaceId: string | null;
}

export function usePromptInputPaste({
  promptInput,
  workspaceId,
}: UsePromptInputPasteArgs) {
  return async function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const clipboardData = e.clipboardData;
    if (!clipboardData || !workspaceId) return;

    const files = Array.from(clipboardData.files) as File[];

    if (files.length > 0) {
      e.preventDefault();
      const imageFile = files.find((file: File) => file.type.startsWith("image/"));
      const fileToUpload = imageFile || files[0];

      if (fileToUpload) {
        try {
          await promptInput?.addAttachment(fileToUpload);
        } catch (error) {
          console.error("Failed to add file attachment:", error);
        }
      }
      return;
    }

    const clipboardItems = Array.from(clipboardData.items) as DataTransferItem[];
    const imageItem = clipboardItems.find((item: DataTransferItem) =>
      item.type.startsWith("image/"),
    );

    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        try {
          await promptInput?.addAttachment(file);
        } catch (error) {
          console.error("Failed to add image attachment:", error);
        }
      }
    }
  };
}
