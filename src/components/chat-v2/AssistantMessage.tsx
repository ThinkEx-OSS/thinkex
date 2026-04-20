"use client";

import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { AssistantActionBar } from "./AssistantActionBar";
import { BranchNav } from "./BranchNav";
import { TextPart } from "./parts/TextPart";
import { ToolGroup } from "./parts/ToolGroup";
import { ReasoningPart } from "./parts/ReasoningPart";
import { groupParts } from "./parts/group-parts";
import type { ChatMessage } from "@/lib/chat-v2/types";

interface AssistantMessageProps {
  threadId?: string | null;
  message: ChatMessage;
  isStreaming: boolean;
  blankSize?: number;
  onRefresh: (messageId: string) => void;
  onReloadThread: () => Promise<void>;
}

export function AssistantMessage({ threadId, message, isStreaming, blankSize, onRefresh, onReloadThread }: AssistantMessageProps) {
  const grouped = useMemo(() => groupParts(message.parts), [message.parts]);
  const textContent = useMemo(
    () => message.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n\n"),
    [message.parts],
  );

  return (
    <div className="chat-v2-assistant-message relative mx-auto w-full max-w-[50rem] pb-4 last:mb-4" data-role="assistant">
      <div className="chat-v2-assistant-message-content mx-2 leading-7 break-words text-foreground" style={blankSize ? { minHeight: blankSize } : undefined}>
        {isStreaming && message.parts.length === 0 ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        {grouped.map((segment, index) => {
          if (segment.kind === "reasoning") {
            return (
              <ReasoningPart
                key={`${message.id}-reasoning-${index}`}
                parts={segment.parts}
                isStreaming={isStreaming && grouped.at(-1) === segment}
                threadId={threadId}
                messageId={message.id}
              />
            );
          }
          if (segment.kind === "tools") {
            return <ToolGroup key={`${message.id}-tools-${index}`} parts={segment.parts} isStreaming={isStreaming && grouped.at(-1) === segment} />;
          }
          if (segment.part.type === "text") {
            return <TextPart key={`${message.id}-text-${index}`} text={segment.part.text} isStreaming={isStreaming && index === grouped.length - 1} threadId={threadId} messageId={message.id} />;
          }
          if (segment.part.type === "file") {
            return <a key={`${message.id}-file-${index}`} href={segment.part.url} target="_blank" rel="noreferrer" className="mt-2 flex text-sm text-primary underline-offset-4 hover:underline">{segment.part.filename ?? segment.part.url}</a>;
          }
          if (segment.part.type === "source-url") {
            return <a key={`${message.id}-source-${index}`} href={segment.part.url} target="_blank" rel="noreferrer" className="mt-2 flex text-xs text-muted-foreground underline-offset-4 hover:underline">{segment.part.title ?? segment.part.url}</a>;
          }
          if (segment.part.type === "source-document") {
            return <div key={`${message.id}-document-${index}`} className="mt-2 text-xs text-muted-foreground">{segment.part.title}</div>;
          }
          return null;
        })}
      </div>

      <div className="mt-2 ml-2 flex items-center gap-2">
        <BranchNav threadId={threadId} messageId={message.id} onChanged={onReloadThread} />
        <AssistantActionBar textContent={textContent} onRefresh={() => onRefresh(message.id)} />
      </div>
    </div>
  );
}
