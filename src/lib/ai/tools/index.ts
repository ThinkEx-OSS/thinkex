/**
 * Chat Tools Index
 * Factory function to create all chat tools with shared context
 */

import { frontendTools } from "@assistant-ui/react-ai-sdk";
import { createProcessFilesTool } from "./process-files";
import { createProcessUrlsTool } from "./process-urls";
import { createSearchWebTool, createExecuteCodeTool } from "./search-code";
import {
    createNoteTool,
    createUpdateCardTool,
    createClearCardContentTool,
    createDeleteCardTool,
    createSelectCardsTool,
    type WorkspaceToolContext,
} from "./workspace-tools";
import { createFlashcardsTool, createUpdateFlashcardsTool } from "./flashcard-tools";
import { createQuizTool, createUpdateQuizTool } from "./quiz-tools";
import { createDeepResearchTool } from "./deep-research";
import { logger } from "@/lib/utils/logger";

export interface ChatToolsConfig {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    clientTools?: Record<string, any>;
    /** Messages from the conversation - needed for quiz context extraction */
    messages?: any[];
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
        processFiles: createProcessFilesTool(),
        processUrls: createProcessUrlsTool(),

        // Search & code execution
        searchWeb: createSearchWebTool(),
        executeCode: createExecuteCodeTool(),

        // Workspace operations
        createNote: createNoteTool(ctx),
        updateCard: createUpdateCardTool(ctx),
        clearCardContent: createClearCardContentTool(ctx),
        deleteCard: createDeleteCardTool(ctx),
        selectCards: createSelectCardsTool(ctx),

        // Flashcards
        createFlashcards: createFlashcardsTool(ctx),
        updateFlashcards: createUpdateFlashcardsTool(ctx),

        // Quizzes
        createQuiz: createQuizTool(ctx, config.messages || []),
        updateQuiz: createUpdateQuizTool(ctx, config.messages || []),

        // Deep research
        deepResearch: createDeepResearchTool(ctx),

        // Client tools from frontend
        ...frontendClientTools,
    };
}

// Re-export types
export type { WorkspaceToolContext } from "./workspace-tools";
