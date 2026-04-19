"use client";

import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FC } from "react";
import { ChatActionBar, useChatMessage } from "@/lib/chat/runtime";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const AssistantActionBar: FC = () => {
  const { content } = useChatMessage();

  const textContent = useMemo(() => {
    const textParts = content.filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    );
    return textParts.map((part) => part.text ?? "").join("\n\n");
  }, [content]);

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  return (
    <ChatActionBar.Root
      hideWhenRunning
      autohide="never"
      className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1 flex gap-0.5 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <TooltipIconButton tooltip="Copy" onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </TooltipIconButton>
      <ChatActionBar.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ChatActionBar.Reload>
    </ChatActionBar.Root>
  );
};
