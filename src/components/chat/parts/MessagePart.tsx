"use client";

import type { ToolUIPart, UIMessagePart } from "ai";
import { isToolUIPart } from "ai";
import { memo, type ReactNode } from "react";

import { LEGACY_CHAT_TOOL_NAMES } from "@/lib/ai/chat-tool-names";
import {
  toolPartToRenderArgs,
  type ChatToolUIRenderArgs,
} from "@/lib/chat/tool-ui-types";
import type { ChatMessage } from "@/lib/chat/types";

import { FilePart } from "./FilePart";
import { MarkdownText } from "./MarkdownText";
import { Reasoning } from "./Reasoning";
import { Source } from "./Sources";
import { TOOL_RENDERERS } from "@/components/chat/tools/registry";
import { ToolFallback } from "@/components/chat/tools/tool-fallback";

type AnyPart = UIMessagePart<any, any>;

interface MessagePartProps {
  part: AnyPart;
  partIndex: number;
  totalParts: number;
  message: ChatMessage;
  /** True when the message is the latest assistant turn. */
  isLastAssistant: boolean;
  /** True while the parent message itself is mid-stream. */
  isStreaming: boolean;
  /** Combined messageId+partIndex stable key, used by markdown remount logic. */
  messageKey: string;
}

function isToolPart(part: AnyPart): part is ToolUIPart {
  return isToolUIPart(part as ToolUIPart);
}

function getCanonicalToolName(rawName: string): string {
  return LEGACY_CHAT_TOOL_NAMES[rawName] ?? rawName;
}

const MessagePartImpl = ({
  part,
  partIndex,
  totalParts,
  message,
  isLastAssistant,
  isStreaming,
  messageKey,
}: MessagePartProps) => {
  const isLastPart = partIndex === totalParts - 1;
  const partIsStreaming = isStreaming && isLastPart;

  // Handle tool-* parts first since their type is dynamic.
  if (isToolPart(part)) {
    const rawName = part.type.slice("tool-".length);
    const canonical = getCanonicalToolName(rawName);
    const renderer = TOOL_RENDERERS[canonical];
    const renderArgs: ChatToolUIRenderArgs = toolPartToRenderArgs(part);

    if (renderer) {
      return <>{renderer(renderArgs)}</>;
    }

    const argsText = renderArgs.args
      ? JSON.stringify(renderArgs.args, null, 2)
      : "";
    return (
      <ToolFallback
        toolName={rawName}
        argsText={argsText}
        result={renderArgs.result}
      />
    );
  }

  switch (part.type) {
    case "text": {
      const text = (part as { text?: string }).text ?? "";
      if (message.role === "user") {
        // User text is a plain pre-wrapped paragraph; we keep the styling on
        // the wrapper to avoid pulling in the heavier markdown pipeline.
        return <span className="whitespace-pre-wrap">{text}</span>;
      }
      return (
        <MarkdownText
          text={text}
          isStreaming={partIsStreaming}
          messageKey={messageKey}
        />
      );
    }
    case "reasoning": {
      const text = (part as { text?: string }).text ?? "";
      return <Reasoning text={text} isStreaming={partIsStreaming} />;
    }
    case "file": {
      const filePart = part as {
        url?: string;
        mediaType?: string;
        filename?: string;
      };
      if (!filePart.url || !filePart.mediaType) return null;
      return (
        <FilePart
          url={filePart.url}
          mediaType={filePart.mediaType}
          filename={filePart.filename}
        />
      );
    }
    case "source-url": {
      const src = part as { url?: string; title?: string };
      return <Source url={src.url} title={src.title} sourceType="url" />;
    }
    case "source-document": {
      const src = part as { title?: string };
      // Document sources surface as an inline badge for now.
      return src.title ? (
        <span className="text-xs text-muted-foreground">{src.title}</span>
      ) : null;
    }
    case "step-start":
      return null;
    default:
      return null;
  }
};

export const MessagePart = memo(MessagePartImpl) as (
  props: MessagePartProps,
) => ReactNode;
