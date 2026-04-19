"use client";

import { CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FC } from "react";
import { ChatActionBar, useChatMessage } from "@/lib/chat/runtime";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const UserActionBar: FC = () => {
  const message = useChatMessage();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const textContent = useMemo(() => {
    return message.content
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text ?? "")
      .join("\n\n");
  }, [message.content]);

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
      autohide="not-last"
      className="aui-user-action-bar-root flex gap-1 text-muted-foreground data-floating:absolute data-floating:rounded-md data-floating:border data-floating:bg-background data-floating:p-1 data-floating:shadow-sm"
    >
      <TooltipIconButton tooltip="Copy" onClick={handleCopy}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </TooltipIconButton>
      <ChatActionBar.Edit asChild>
        <TooltipIconButton tooltip="Edit">
          <PencilIcon />
        </TooltipIconButton>
      </ChatActionBar.Edit>
    </ChatActionBar.Root>
  );
};
