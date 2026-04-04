"use client";

import type { Toolkit } from "@assistant-ui/react";
import {
  CHAT_TOOL,
  LEGACY_CHAT_TOOL_NAMES,
  type ChatToolName,
} from "@/lib/ai/chat-tool-names";
import { renderAddYoutubeVideoToolUI } from "@/components/assistant-ui/AddYoutubeVideoToolUI";
import { renderCreateDocumentToolUI } from "@/components/assistant-ui/CreateDocumentToolUI";
import { renderCreateFlashcardToolUI } from "@/components/assistant-ui/CreateFlashcardToolUI";
import { renderCreateQuizToolUI } from "@/components/assistant-ui/CreateQuizToolUI";
import { renderEditItemToolUI } from "@/components/assistant-ui/EditItemToolUI";
import { renderReadWorkspaceToolUI } from "@/components/assistant-ui/ReadWorkspaceToolUI";
import { renderSearchWorkspaceToolUI } from "@/components/assistant-ui/SearchWorkspaceToolUI";
import { renderURLContextToolUI } from "@/components/assistant-ui/URLContextToolUI";
import { renderWebSearchToolUI } from "@/components/assistant-ui/WebSearchToolUI";
import { renderYouTubeSearchToolUI } from "@/components/assistant-ui/YouTubeSearchToolUI";

function createBackendTool(
  render: NonNullable<Toolkit[string]["render"]>,
): Toolkit[string] {
  return {
    type: "backend",
    render,
  };
}

function withLegacyNames(
  canonical: ChatToolName,
  definition: Toolkit[string],
): Toolkit {
  const entries: Toolkit = {
    [canonical]: definition,
  };

  for (const [legacyName, mappedCanonical] of Object.entries(
    LEGACY_CHAT_TOOL_NAMES,
  )) {
    if (mappedCanonical === canonical) {
      entries[legacyName] = definition;
    }
  }

  return entries;
}

export const chatToolToolkit: Toolkit = {
  ...withLegacyNames(
    CHAT_TOOL.WEB_FETCH,
    createBackendTool(renderURLContextToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.WEB_SEARCH,
    createBackendTool(renderWebSearchToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.WORKSPACE_SEARCH,
    createBackendTool(renderSearchWorkspaceToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.WORKSPACE_READ,
    createBackendTool(renderReadWorkspaceToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.DOCUMENT_CREATE,
    createBackendTool(renderCreateDocumentToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.ITEM_EDIT,
    createBackendTool(renderEditItemToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.FLASHCARDS_CREATE,
    createBackendTool(renderCreateFlashcardToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.QUIZ_CREATE,
    createBackendTool(renderCreateQuizToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.YOUTUBE_SEARCH,
    createBackendTool(renderYouTubeSearchToolUI),
  ),
  ...withLegacyNames(
    CHAT_TOOL.YOUTUBE_ADD,
    createBackendTool(renderAddYoutubeVideoToolUI),
  ),
};
