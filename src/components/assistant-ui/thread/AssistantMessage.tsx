"use client";

import type { FC } from "react";
import { AssistantLoader } from "@/components/assistant-ui/assistant-loader";
import { File as FileComponent } from "@/components/assistant-ui/file";
import { Image } from "@/components/assistant-ui/image";
import { MarkdownText } from "@/components/assistant-ui/markdown-text";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { Sources } from "@/components/assistant-ui/sources";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { ToolGroup } from "@/components/assistant-ui/tool-group";
import { ChatMessage } from "@/lib/chat/runtime";
import { AssistantActionBar } from "./AssistantActionBar";
import { BranchPicker } from "./BranchPicker";
import { MessageError } from "./MessageError";

export const AssistantMessage: FC = () => {
  return (
    <ChatMessage.Root asChild>
      <div
        className="aui-assistant-message-root relative mx-auto w-full max-w-[var(--thread-max-width)] animate-in pb-4 duration-150 ease-out fade-in slide-in-from-bottom-1 last:mb-4"
        data-role="assistant"
      >
        <div className="aui-assistant-message-content mx-2 leading-7 break-words text-foreground">
          <AssistantLoader />
          <ChatMessage.Parts
            components={{
              Text: MarkdownText,
              File: FileComponent,
              Source: Sources,
              Image,
              Reasoning,
              ReasoningGroup,
              ToolGroup,
              tools: {
                Fallback: ToolFallback,
              },
            }}
          />
          <MessageError />
        </div>

        <div className="aui-assistant-message-footer mt-2 ml-2 flex">
          <BranchPicker />
          <AssistantActionBar />
        </div>
      </div>
    </ChatMessage.Root>
  );
};
