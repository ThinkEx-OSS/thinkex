/**
 * Chat Tools Index
 * Factory function to create all chat tools with shared context
 */

import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { createProcessFilesTool } from "./process-files";
import { createProcessUrlsTool } from "./process-urls";
import { createExecuteCodeTool } from "./search-code";
import {
    createNoteTool,
    createUpdateNoteTool,
    createDeleteItemTool,
    createSelectCardsTool,
    type WorkspaceToolContext,
} from "./workspace-tools";
import { createFlashcardsTool, createUpdateFlashcardsTool } from "./flashcard-tools";
import { createQuizTool, createUpdateQuizTool } from "./quiz-tools";
import { createDeepResearchTool } from "./deep-research";
import { createSearchYoutubeTool, createAddYoutubeVideoTool } from "./youtube-tools";
import { createSearchImagesTool, createAddImageTool } from "./image-tools";
import { createWebSearchTool } from "./web-search";
import { logger } from "@/lib/utils/logger";

export interface ChatToolsConfig {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    clientTools?: Record<string, any>;
    enableDeepResearch?: boolean;
}

/**
 * Create all chat tools with the given context
 */
export function createChatTools(config: ChatToolsConfig): Record<string, any> {
    const ctx: WorkspaceToolContext = {
        workspaceId: config.workspaceId,
        userId: config.userId,
        activeFolderId: config.activeFolderId,
    };

    // Safeguard frontendTools
    let frontendClientTools = {};
    try {
        frontendClientTools = frontendTools(config.clientTools || {});
    } catch (e) {
        logger.error("❌ frontendTools failed:", e);
    }

    return {
        // File & URL processing
        processFiles: createProcessFilesTool(ctx),
        processUrls: createProcessUrlsTool(),

        // Search & code execution
        webSearch: createWebSearchTool(),
        executeCode: createExecuteCodeTool(),

        // Workspace operations
        createNote: createNoteTool(ctx),
        updateNote: createUpdateNoteTool(ctx),

        deleteItem: createDeleteItemTool(ctx),
        selectCards: createSelectCardsTool(ctx),

        // Flashcards
        createFlashcards: createFlashcardsTool(ctx),
        updateFlashcards: createUpdateFlashcardsTool(ctx),

        // Quizzes
        createQuiz: createQuizTool(ctx),
        updateQuiz: createUpdateQuizTool(ctx),

        // Deep research - commented out
        // ...(config.enableDeepResearch ? { deepResearch: createDeepResearchTool(ctx) } : {}),

        // YouTube
        searchYoutube: createSearchYoutubeTool(),
        addYoutubeVideo: createAddYoutubeVideoTool(ctx),

        // Google Images
        searchImages: createSearchImagesTool(),
        addImage: createAddImageTool(ctx),

        // Client tools from frontend
        ...frontendClientTools,
    };
}

// Re-export types
export type { WorkspaceToolContext } from "./workspace-tools";
