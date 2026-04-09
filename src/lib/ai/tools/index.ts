/**
 * Chat Tools Index
 * Factory function to create all chat tools with shared context
 */

import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { createProcessUrlsTool } from "./process-urls";
import {
  createDocumentTool,
  createDeleteItemTool,
  type WorkspaceToolContext,
} from "./workspace-tools";
import { createEditItemTool } from "./edit-item-tool";
import { createFlashcardsTool } from "./flashcard-tools";
import { createQuizTool } from "./quiz-tools";
import {
  createSearchYoutubeTool,
  createAddYoutubeVideoTool,
} from "./youtube-tools";
import { createWebSearchTool } from "./web-search";
import { createSearchWorkspaceTool } from "./search-workspace";
import { createReadWorkspaceTool } from "./read-workspace";
import { createExecuteCodeTool } from "./execute-code";
import { createEscalateModelTool } from "./escalate-model";
import { logger } from "@/lib/utils/logger";
import { CHAT_TOOL } from "@/lib/ai/chat-tool-names";

export interface ChatToolsConfig {
  workspaceId: string | null;
  userId: string | null;
  activeFolderId?: string;
  threadId?: string | null;
  clientTools?: Record<string, any>;
}

/**
 * Create all chat tools with the given context
 */
export function createChatTools(config: ChatToolsConfig): Record<string, any> {
  const ctx: WorkspaceToolContext = {
    workspaceId: config.workspaceId,
    userId: config.userId,
    activeFolderId: config.activeFolderId,
    threadId: config.threadId ?? null,
  };

  // Safeguard frontendTools
  let frontendClientTools = {};
  try {
    frontendClientTools = frontendTools(config.clientTools || {});
  } catch (e) {
    logger.error("❌ frontendTools failed:", e);
  }

  return {
    // URL processing
    [CHAT_TOOL.WEB_FETCH]: createProcessUrlsTool(),

    // Search
    [CHAT_TOOL.WEB_SEARCH]: createWebSearchTool(),
    [CHAT_TOOL.CODE_EXECUTE]: createExecuteCodeTool(),
    [CHAT_TOOL.ESCALATE_MODEL]: createEscalateModelTool(),
    [CHAT_TOOL.WORKSPACE_SEARCH]: createSearchWorkspaceTool(ctx),
    [CHAT_TOOL.WORKSPACE_READ]: createReadWorkspaceTool(ctx),

    // Workspace operations
    [CHAT_TOOL.DOCUMENT_CREATE]: createDocumentTool(ctx),
    [CHAT_TOOL.ITEM_EDIT]: createEditItemTool(ctx),

    [CHAT_TOOL.ITEM_DELETE]: createDeleteItemTool(ctx),

    // Flashcards
    [CHAT_TOOL.FLASHCARDS_CREATE]: createFlashcardsTool(ctx),

    // Quizzes
    [CHAT_TOOL.QUIZ_CREATE]: createQuizTool(ctx),

    // YouTube
    [CHAT_TOOL.YOUTUBE_SEARCH]: createSearchYoutubeTool(),
    [CHAT_TOOL.YOUTUBE_ADD]: createAddYoutubeVideoTool(ctx),

    // Client tools from frontend
    ...frontendClientTools,
  };
}

// Re-export types
export type { WorkspaceToolContext } from "./workspace-tools";
