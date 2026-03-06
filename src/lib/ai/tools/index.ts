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
    createDeleteItemTool,
    type WorkspaceToolContext,
} from "./workspace-tools";
import { createEditItemTool } from "./edit-item-tool";
import { createFlashcardsTool } from "./flashcard-tools";
import { createQuizTool } from "./quiz-tools";
import { createDeepResearchTool } from "./deep-research";
import { createSearchYoutubeTool, createAddYoutubeVideoTool } from "./youtube-tools";
// import { createSearchImagesTool, createAddImageTool } from "./image-tools";
import { createWebSearchTool } from "./web-search";
import { createSearchWorkspaceTool } from "./search-workspace";
import { createReadWorkspaceTool } from "./read-workspace";
import { logger } from "@/lib/utils/logger";

export interface ChatToolsConfig {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    threadId?: string | null;
    clientTools?: Record<string, any>;
    enableDeepResearch?: boolean;
    /** When 'viewer', state-modifying tools (create/edit/delete notes, flashcards, etc.) are excluded */
    permissionLevel?: "owner" | "editor" | "viewer";
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

    const isViewOnly = config.permissionLevel === "viewer";

    const readOnlyTools: Record<string, any> = {
        // File & URL processing
        processFiles: createProcessFilesTool(ctx),
        processUrls: createProcessUrlsTool(),

        // Search & code execution
        webSearch: createWebSearchTool(),
        executeCode: createExecuteCodeTool(),
        searchWorkspace: createSearchWorkspaceTool(ctx),
        readWorkspace: createReadWorkspaceTool(ctx),

        // Client tools from frontend
        ...frontendClientTools,
    };

    const editorOnlyTools: Record<string, any> = {
        searchYoutube: createSearchYoutubeTool(),
        createNote: createNoteTool(ctx),
        editItem: createEditItemTool(ctx),
        deleteItem: createDeleteItemTool(ctx),
        createFlashcards: createFlashcardsTool(ctx),
        createQuiz: createQuizTool(ctx),
        addYoutubeVideo: createAddYoutubeVideoTool(ctx),
    };

    return {
        ...readOnlyTools,
        ...(isViewOnly ? {} : editorOnlyTools),
    };
}

// Re-export types
export type { WorkspaceToolContext } from "./workspace-tools";
