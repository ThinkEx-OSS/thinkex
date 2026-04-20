/**
 * Chat Tools Index
 * Factory function to create all chat tools with shared context
 */

import { createProcessUrlsTool } from "./process-urls";
import { createDocumentTool, createDeleteItemTool, type WorkspaceToolContext } from "./workspace-tools";
import { createEditItemTool } from "./edit-item-tool";
import { createFlashcardsTool } from "./flashcard-tools";
import { createQuizTool } from "./quiz-tools";
import { createSearchYoutubeTool, createAddYoutubeVideoTool } from "./youtube-tools";
import { createWebSearchTool } from "./web-search";
import { createSearchWorkspaceTool } from "./search-workspace";
import { createReadWorkspaceTool } from "./read-workspace";
import { createExecuteCodeTool } from "./execute-code";
import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";
import type { Tool } from "ai";

export interface ChatToolsConfig {
  workspaceId: string | null;
  userId: string | null;
  activeFolderId?: string;
  threadId?: string | null;
  clientTools?: Record<string, unknown>;
}

export function createChatTools(
  config: ChatToolsConfig,
): Record<string, Tool<unknown, unknown>> {
  const ctx: WorkspaceToolContext = {
    workspaceId: config.workspaceId,
    userId: config.userId,
    activeFolderId: config.activeFolderId,
    threadId: config.threadId ?? null,
  };

  return {
    [CHAT_TOOL.WEB_FETCH]: createProcessUrlsTool(),
    [CHAT_TOOL.WEB_SEARCH]: createWebSearchTool(),
    [CHAT_TOOL.CODE_EXECUTE]: createExecuteCodeTool(),
    [CHAT_TOOL.WORKSPACE_SEARCH]: createSearchWorkspaceTool(ctx),
    [CHAT_TOOL.WORKSPACE_READ]: createReadWorkspaceTool(ctx),
    [CHAT_TOOL.DOCUMENT_CREATE]: createDocumentTool(ctx),
    [CHAT_TOOL.ITEM_EDIT]: createEditItemTool(ctx),
    [CHAT_TOOL.ITEM_DELETE]: createDeleteItemTool(ctx),
    [CHAT_TOOL.FLASHCARDS_CREATE]: createFlashcardsTool(ctx),
    [CHAT_TOOL.QUIZ_CREATE]: createQuizTool(ctx),
    [CHAT_TOOL.YOUTUBE_SEARCH]: createSearchYoutubeTool(),
    [CHAT_TOOL.YOUTUBE_ADD]: createAddYoutubeVideoTool(ctx),
  } as Record<string, Tool<unknown, unknown>>;
}

export type { WorkspaceToolContext } from "./workspace-tools";
