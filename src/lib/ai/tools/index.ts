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
    createDocumentTool,
    createDeleteItemTool,
    type WorkspaceToolContext,
} from "./workspace-tools";
import { createEditItemTool } from "./edit-item-tool";
import { createFlashcardsTool } from "./flashcard-tools";
import { createQuizTool } from "./quiz-tools";
import { createDeepResearchTool } from "./deep-research";
import { createSearchYoutubeTool, createAddYoutubeVideoTool } from "./youtube-tools";
import { createWebSearchTool } from "./web-search";
import { createSearchWorkspaceTool } from "./search-workspace";
import { createReadWorkspaceTool } from "./read-workspace";
import { createMagicFetchTool } from "./magic-fetch";
import { logger } from "@/lib/utils/logger";

export interface ChatToolsConfig {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    threadId?: string | null;
    clientTools?: Record<string, any>;
    enableDeepResearch?: boolean;
    /** Experiment: enable magic_fetch tool (logs AI data requests to PostHog) */
    enableMagicFetch?: boolean;
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
        // File & URL processing
        processFiles: createProcessFilesTool(ctx),
        processUrls: createProcessUrlsTool(),

        // Search & code execution
        webSearch: createWebSearchTool(),
        executeCode: createExecuteCodeTool(),
        searchWorkspace: createSearchWorkspaceTool(ctx),
        readWorkspace: createReadWorkspaceTool(ctx),

        // Workspace operations
        createNote: createNoteTool(ctx),
        createDocument: createDocumentTool(ctx),
        editItem: createEditItemTool(ctx),

        deleteItem: createDeleteItemTool(ctx),

        // Flashcards
        createFlashcards: createFlashcardsTool(ctx),

        // Quizzes
        createQuiz: createQuizTool(ctx),

        // Deep research - commented out
        // ...(config.enableDeepResearch ? { deepResearch: createDeepResearchTool(ctx) } : {}),

        // YouTube
        searchYoutube: createSearchYoutubeTool(),
        addYoutubeVideo: createAddYoutubeVideoTool(ctx),

        // Experiment: magic_fetch (logs to PostHog via OpenTelemetry)
        ...(config.enableMagicFetch ? { magicFetch: createMagicFetchTool(ctx) } : {}),

        // Google Images
        // searchImages: createSearchImagesTool(),
        // addImage: createAddImageTool(ctx),

        // Client tools from frontend
        ...frontendClientTools,
    };
}

// Re-export types
export type { WorkspaceToolContext } from "./workspace-tools";
