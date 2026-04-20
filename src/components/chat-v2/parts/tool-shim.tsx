"use client";

import { createElement, type ComponentType, type ReactNode } from "react";
import { canonicalizeToolUIPartType } from "@/lib/ai/chat-tool-names";
import type { ChatToolPart } from "@/lib/chat-v2/types";
import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";
import { renderWebSearchToolUI } from "@/components/assistant-ui/WebSearchToolUI";
import { renderURLContextToolUI } from "@/components/assistant-ui/URLContextToolUI";
import { renderSearchWorkspaceToolUI } from "@/components/assistant-ui/SearchWorkspaceToolUI";
import { renderReadWorkspaceToolUI } from "@/components/assistant-ui/ReadWorkspaceToolUI";
import { renderCreateDocumentToolUI } from "@/components/assistant-ui/CreateDocumentToolUI";
import { renderEditItemToolUI } from "@/components/assistant-ui/EditItemToolUI";
import { renderCreateFlashcardToolUI } from "@/components/assistant-ui/CreateFlashcardToolUI";
import { renderCreateQuizToolUI } from "@/components/assistant-ui/CreateQuizToolUI";
import { renderYouTubeSearchToolUI } from "@/components/assistant-ui/YouTubeSearchToolUI";
import { renderAddYoutubeVideoToolUI } from "@/components/assistant-ui/AddYoutubeVideoToolUI";
import { renderExecuteCodeToolUI } from "@/components/assistant-ui/ExecuteCodeToolUI";

function toLegacyToolProps(part: ChatToolPart) {
  const toolName = part.type.replace(/^tool-/, "");
  const state = part.state;

  if (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "approval-requested"
  ) {
    return { args: part.input, result: undefined, status: { type: "running" as const }, toolName };
  }

  if (state === "output-available") {
    return { args: part.input, result: part.output, status: { type: "complete" as const }, toolName };
  }

  if (
    state === "output-error" ||
    (state === "approval-responded" && part.approval.approved === false)
  ) {
    return {
      args: part.input,
      result: part.output,
      status: {
        type: "incomplete" as const,
        reason: "error" as const,
        error: part.errorText,
      },
      toolName,
    };
  }

  return { args: part.input, result: undefined, status: { type: "running" as const }, toolName };
}

type LegacyToolProps = ReturnType<typeof toLegacyToolProps>;

function renderComponent(
  renderer: ComponentType<LegacyToolProps>,
  props: LegacyToolProps,
) {
  return createElement(renderer, props);
}

export function renderLegacyTool(part: ChatToolPart): ReactNode {
  const legacyProps = toLegacyToolProps(part);
  const type = canonicalizeToolUIPartType(part.type).replace(/^tool-/, "");
  const toolName = legacyProps.toolName;

  switch (type) {
    case CHAT_TOOL.WEB_FETCH:
      return renderComponent(renderURLContextToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.WEB_SEARCH:
      return renderComponent(renderWebSearchToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.WORKSPACE_SEARCH:
      return renderComponent(renderSearchWorkspaceToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.WORKSPACE_READ:
      return renderComponent(renderReadWorkspaceToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.DOCUMENT_CREATE:
      return renderComponent(renderCreateDocumentToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.ITEM_EDIT:
      return renderComponent(renderEditItemToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.FLASHCARDS_CREATE:
      return renderComponent(renderCreateFlashcardToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.QUIZ_CREATE:
      return renderComponent(renderCreateQuizToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.YOUTUBE_SEARCH:
      return renderComponent(renderYouTubeSearchToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.YOUTUBE_ADD:
      return renderComponent(renderAddYoutubeVideoToolUI as ComponentType<LegacyToolProps>, legacyProps);
    case CHAT_TOOL.CODE_EXECUTE:
      return renderComponent(renderExecuteCodeToolUI as ComponentType<LegacyToolProps>, legacyProps);
    default:
      return (
        <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs">
          <div className="mb-1 font-medium">Tool: {toolName}</div>
          {(part.state === "input-streaming" || part.state === "input-available" || part.state === "approval-requested") ? (
            <div className="text-muted-foreground">Running…</div>
          ) : null}
          {part.state === "output-available" ? (
            <pre className="whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
              {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
            </pre>
          ) : null}
          {part.state === "output-error" ? (
            <div className="text-destructive">Error: {String(part.errorText ?? "tool failed")}</div>
          ) : null}
        </div>
      );
  }
}
