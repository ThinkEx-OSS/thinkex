/**
 * Chat Tools Index
 * Factory function to create all chat tools with shared context
 */

import { createProcessUrlsTool } from "./process-urls";
import { createWebMapTool } from "./web-map";
import {
  createDocumentTool,
  createDeleteItemTool,
  type WorkspaceToolContext,
} from "./workspace-tools";
import { createEditItemTool } from "./edit-item-tool";
import { createFlashcardsTool, createFlashcardAddCardsTool } from "./flashcard-tools";
import { createQuizTool, createQuizAddQuestionsTool } from "./quiz-tools";
import {
  createSearchYoutubeTool,
  createAddYoutubeVideoTool,
} from "./youtube-tools";
import { createWebSearchTool } from "./web-search";
import { createSearchWorkspaceTool } from "./search-workspace";
import { createReadWorkspaceTool } from "./read-workspace";
import { createExecuteCodeTool } from "./execute-code";
import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";

export interface ChatToolsConfig {
  workspaceId: string | null;
  userId: string | null;
  activeFolderId?: string;
  threadId?: string | null;
}

/**
 * Create all chat tools with the given context. The new client runtime no
 * longer ships frontend tools — every tool here runs server-side and the UI
 * just renders the streamed `tool-*` parts.
 */
export function createChatTools(config: ChatToolsConfig): Record<string, any> {
  const ctx: WorkspaceToolContext = {
    workspaceId: config.workspaceId,
    userId: config.userId,
    activeFolderId: config.activeFolderId,
    threadId: config.threadId ?? null,
  };

  return {
    // URL processing
    [CHAT_TOOL.WEB_FETCH]: createProcessUrlsTool(),
    [CHAT_TOOL.WEB_MAP]: createWebMapTool(),

    // Search
    [CHAT_TOOL.WEB_SEARCH]: createWebSearchTool(),
    [CHAT_TOOL.CODE_EXECUTE]: createExecuteCodeTool(),
    [CHAT_TOOL.WORKSPACE_SEARCH]: createSearchWorkspaceTool(ctx),
    [CHAT_TOOL.WORKSPACE_READ]: createReadWorkspaceTool(ctx),

    // Workspace operations
    [CHAT_TOOL.DOCUMENT_CREATE]: createDocumentTool(ctx),
    [CHAT_TOOL.ITEM_EDIT]: createEditItemTool(ctx),

    [CHAT_TOOL.ITEM_DELETE]: createDeleteItemTool(ctx),

    // Flashcards
    [CHAT_TOOL.FLASHCARDS_CREATE]: createFlashcardsTool(ctx),
    [CHAT_TOOL.FLASHCARD_ADD_CARDS]: createFlashcardAddCardsTool(ctx),

    // Quizzes
    [CHAT_TOOL.QUIZ_CREATE]: createQuizTool(ctx),
    [CHAT_TOOL.QUIZ_ADD_QUESTIONS]: createQuizAddQuestionsTool(ctx),

    // YouTube
    [CHAT_TOOL.YOUTUBE_SEARCH]: createSearchYoutubeTool(),
    [CHAT_TOOL.YOUTUBE_ADD]: createAddYoutubeVideoTool(ctx),
  };
}

// Re-export types
export type { WorkspaceToolContext } from "./workspace-tools";
