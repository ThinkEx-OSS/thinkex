"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/chat-v2/types";
import {
  MessageAction as Action,
  MessageActions as Actions,
} from "@/components/ai-elements-v2/message";

export function MessageActions({
  message,
  isLoading,
}: {
  message: ChatMessage;
  isLoading: boolean;
}) {
  if (isLoading || message.role !== "assistant") {
    return null;
  }

  const textFromParts = message.parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("
")
    .trim();

  if (!textFromParts) {
    return null;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textFromParts);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Failed to copy to clipboard.");
    }
  };

  return (
    <Actions className="-ml-0.5 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
      <Action className="text-muted-foreground/50 hover:text-foreground" onClick={handleCopy} tooltip="Copy">
        <CopyIcon className="size-4" />
      </Action>
    </Actions>
  );
}
