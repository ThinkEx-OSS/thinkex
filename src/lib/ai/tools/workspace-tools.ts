import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { formatSelectedCardsContext } from "@/lib/utils/format-workspace-context";
import type { Item } from "@/lib/workspace-state/types";

export interface WorkspaceToolContext {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
}

/**
 * Create the createNote tool
 */
export function createNoteTool(ctx: WorkspaceToolContext) {
    return {
        description: "Create a note card. returns success message.\n\nCRITICAL CONSTRAINTS:\n1. 'content' MUST NOT start with the title.\n2. Start directly with body text.\n3. NO Mermaid diagrams.",
        inputSchema: z.any().describe(
            "JSON {title, content}. 'content': markdown body. DO NOT repeat title in content. Start with subheadings/text. No Mermaid."
        ),
        execute: async ({ title, content }: { title: string; content: string }) => {
            // Validate inputs before use
            if (!title || typeof title !== 'string') {
                return {
                    success: false,
                    message: "Title is required and must be a string",
                };
            }
            if (content === undefined || content === null || typeof content !== 'string') {
                return {
                    success: false,
                    message: "Content is required and must be a string",
                };
            }

            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create note):", { title, contentLength: content.length });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            return await workspaceWorker("create", {
                workspaceId: ctx.workspaceId,
                title,
                content,
                folderId: ctx.activeFolderId,
            });
        },
    };
}

/**
 * Create the updateCard tool
 */
export function createUpdateCardTool(ctx: WorkspaceToolContext) {
    return {
        description: "Update the content of an existing card. This tool COMPLETELY REPLACES the existing content. You must synthesize the FULL new content by combining the existing card content (from your context) with the user's requested changes. Do not just provide the diff; provide the complete new markdown content.",
        inputSchema: z.any().describe(
            "A JSON object with 'id' (string) and 'markdown' (string) or 'content' (string) fields. The 'id' uniquely identifies the note to update. The 'markdown' or 'content' field contains the full note body ONLY (do not include the title as a header). Ensure math inside lists and tables has spaces around the $$ symbols. Do not place punctuation immediately after math expressions."
        ),
        execute: async (input: any) => {
            logger.group("🎯 [UPDATE-CARD] Tool execution started", true);
            logger.debug("Raw input received:", {
                inputType: typeof input,
                inputKeys: input ? Object.keys(input) : [],
                hasId: !!input?.id,
                hasMarkdown: !!input?.markdown,
                hasContent: !!input?.content,
            });
            logger.groupEnd();

            try {
                const id = input?.id;
                const markdown = input?.markdown ?? input?.content;

                if (!id || typeof id !== 'string') {
                    logger.error("❌ [UPDATE-CARD] Invalid or missing id parameter:", { id, idType: typeof id });
                    return {
                        success: false,
                        message: "Card ID is required and must be a string",
                    };
                }

                if (markdown === undefined || markdown === null) {
                    logger.error("❌ [UPDATE-CARD] Missing markdown/content parameter");
                    return {
                        success: false,
                        message: "Markdown content is required (use 'markdown' or 'content' field)",
                    };
                }

                if (typeof markdown !== 'string') {
                    logger.error("❌ [UPDATE-CARD] Invalid markdown/content type:", { markdownType: typeof markdown });
                    return {
                        success: false,
                        message: "Markdown content must be a string",
                    };
                }

                logger.debug("🎯 [UPDATE-CARD] Delegating to Workspace Worker (update):", {
                    id,
                    contentLength: markdown.length,
                });

                if (!ctx.workspaceId) {
                    logger.error("❌ [UPDATE-CARD] No workspace context available");
                    return {
                        success: false,
                        message: "No workspace context available",
                    };
                }

                const result = await workspaceWorker("update", {
                    workspaceId: ctx.workspaceId,
                    itemId: id,
                    content: markdown,
                });

                logger.debug("✅ [UPDATE-CARD] Workspace worker returned:", { success: result?.success });
                return result;
            } catch (error: any) {
                logger.error("❌ [UPDATE-CARD] Error during execution:", error?.message || String(error));
                return {
                    success: false,
                    message: `Failed to update card: ${error?.message || String(error)}`,
                };
            }
        },
    };
}

/**
 * Create the clearCardContent tool
 */
export function createClearCardContentTool(ctx: WorkspaceToolContext) {
    return {
        description: "Clear/delete the content of a card while preserving its title. Use this when the user wants to delete the contents of a card.",
        inputSchema: z.object({
            id: z.string().describe("The ID of the card to clear"),
        }),
        execute: async ({ id }: { id: string }) => {
            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (clear):", { id });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            return await workspaceWorker("update", {
                workspaceId: ctx.workspaceId,
                itemId: id,
                content: "",
            });
        },
    };
}

/**
 * Create the deleteCard tool
 */
export function createDeleteCardTool(ctx: WorkspaceToolContext) {
    return {
        description: "Permanently delete a card/note from the workspace. Use this when the user explicitly asks to delete or remove a card.",
        inputSchema: z.object({
            id: z.string().describe("The ID of the card to delete"),
        }),
        execute: async ({ id }: { id: string }) => {
            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (delete):", { id });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            return await workspaceWorker("delete", {
                workspaceId: ctx.workspaceId,
                itemId: id,
            });
        },
    };
}

/**
 * Create the selectCards tool
 */
export function createSelectCardsTool(ctx: WorkspaceToolContext) {
    return {
        description:
            "Select one or more cards by their TITLES and add them to the conversation context. This tool helps you surface specific cards when the user refers to them. The tool will perform fuzzy matching to find the best matching cards and return their full content immediately.",
        inputSchema: z.object({
            cardTitles: z.array(z.string()).describe("Array of card titles to search for and select"),
        }),
        execute: async (input: { cardTitles: string[] }) => {
            const { cardTitles } = input;

            if (!cardTitles || cardTitles.length === 0) {
                return {
                    success: false,
                    message: "cardTitles array must be provided and non-empty.",
                    context: "",
                };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                    context: "",
                };
            }

            try {
                // Load workspace state to access all items
                const state = await loadWorkspaceState(ctx.workspaceId);
                
                if (!state || !state.items || state.items.length === 0) {
                    return {
                        success: true,
                        message: `No cards found in workspace. Requested selection of ${cardTitles.length} card${cardTitles.length === 1 ? "" : "s"}: ${cardTitles.join(", ")}.`,
                        addedCount: 0,
                        context: "",
                    };
                }

                // Perform fuzzy matching (matching client-side logic)
                // 1. Exact match first
                // 2. Contains match if no exact match
                const selectedItems: Item[] = [];
                const processedIds = new Set<string>();

                for (const title of cardTitles) {
                    const searchTitle = title.toLowerCase().trim();
                    
                    // Try exact match first
                    let match = state.items.find(
                        item => item.name.toLowerCase().trim() === searchTitle && !processedIds.has(item.id)
                    );
                    
                    // If no exact match, try contains match
                    if (!match) {
                        match = state.items.find(
                            item => item.name.toLowerCase().includes(searchTitle) && !processedIds.has(item.id)
                        );
                    }

                    if (match) {
                        selectedItems.push(match);
                        processedIds.add(match.id);
                    }
                }

                // Format the selected cards context
                const context = formatSelectedCardsContext(selectedItems, state.items);

                const addedCount = selectedItems.length;
                const notFoundCount = cardTitles.length - addedCount;

                let message = `Selected ${addedCount} card${addedCount === 1 ? "" : "s"}`;
                if (notFoundCount > 0) {
                    message += ` (${notFoundCount} not found)`;
                }
                message += `: ${selectedItems.map(item => item.name).join(", ")}`;

                return {
                    success: true,
                    message,
                    addedCount,
                    context, // Return formatted context so AI has immediate access
                    cardTitles: cardTitles,
                };
            } catch (error: any) {
                logger.error("❌ [SELECT-CARDS] Error loading workspace state:", error);
                return {
                    success: false,
                    message: `Failed to load workspace state: ${error?.message || String(error)}`,
                    context: "",
                };
            }
        },
    };
}
