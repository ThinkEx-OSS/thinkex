import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";

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
        description: "Create a note card. returns success message.\n\nCRITICAL CONSTRAINTS:\n1. 'content' MUST NOT start with the title.\n2. Start directly with body text.\n3. Math: use $$...$$ for inline and $$\\n...\\n$$ for block.\n4. NO Mermaid diagrams.",
        inputSchema: z.any().describe(
            "JSON {title, content}. 'content': markdown body. DO NOT repeat title in content. Start with subheadings/text. Math: $$...$$ inline, $$\\n...\\n$$ block. No Mermaid."
        ),
        execute: async ({ title, content }: { title: string; content: string }) => {
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
            "A JSON object with 'id' (string) and 'markdown' (string) or 'content' (string) fields. The 'id' uniquely identifies the note to update. The 'markdown' or 'content' field contains the full note body ONLY (do not include the title as a header). The markdown may include LaTeX math: use $$...$$ for inline math (with proper spacing) and $$...$$ for display math. Ensure math inside lists and tables has spaces around the $$ symbols. Do not place punctuation immediately after math expressions."
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
            "Select one or more cards by their TITLES and add them to the conversation context. This tool helps you surface specific cards when the user refers to them. The tool will find the best matching cards for the titles you provide and add them to the system context.",
        inputSchema: z.object({
            cardTitles: z.array(z.string()).describe("Array of card titles to search for and select"),
        }),
        execute: async (input: { cardTitles: string[] }) => {
            const { cardTitles } = input;

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            if (!cardTitles || cardTitles.length === 0) {
                return {
                    success: false,
                    message: "cardTitles array must be provided and non-empty.",
                };
            }

            try {
                if (!ctx.userId) {
                    return { success: false, message: "User not authenticated" };
                }

                const workspace = await db
                    .select({ userId: workspaces.userId })
                    .from(workspaces)
                    .where(eq(workspaces.id, ctx.workspaceId))
                    .limit(1);

                if (!workspace[0]) {
                    return { success: false, message: "Workspace not found" };
                }

                if (workspace[0].userId !== ctx.userId) {
                    logger.warn(`🔒 [SELECT-CARDS] Access denied for user ${ctx.userId} to workspace ${ctx.workspaceId}`);
                    return {
                        success: false,
                        message: "Access denied. You do not have permission to view cards in this workspace.",
                    };
                }

                const state = await loadWorkspaceState(ctx.workspaceId);
                const foundCardIds = new Set<string>();
                const notFoundTitles: string[] = [];

                cardTitles.forEach(title => {
                    const searchTitle = title.toLowerCase().trim();
                    let match = state.items.find(item => item.name.toLowerCase().trim() === searchTitle);

                    if (!match) {
                        match = state.items.find(item => item.name.toLowerCase().includes(searchTitle));
                    }

                    if (match) {
                        foundCardIds.add(match.id);
                    } else {
                        notFoundTitles.push(title);
                    }
                });

                const validCardIds = Array.from(foundCardIds);

                if (validCardIds.length === 0) {
                    const availableCards = state.items.map(i => `"${i.name}"`).join(", ");
                    return {
                        success: false,
                        message: `No cards found matching your request. ${notFoundTitles.length > 0 ? `Could not find: ${notFoundTitles.join(", ")}. ` : ""}Available cards: ${availableCards}`,
                        cardContent: "",
                    };
                }

                const selectedCards = state.items.filter((item) =>
                    validCardIds.includes(item.id)
                );

                const message = `Selected ${selectedCards.length} card${selectedCards.length === 1 ? "" : "s"}. ${notFoundTitles.length > 0 ? `(Could not find: ${notFoundTitles.join(", ")}) ` : ""}NOTE: This selection was made at the time of this tool call. For the current active selection, checking the 'CARDS IN CONTEXT DRAWER' section in your system context is recommended.`;

                return {
                    success: true,
                    message,
                    selectedCount: selectedCards.length,
                    selectedCardNames: selectedCards.map((c) => c.name),
                    selectedCardIds: selectedCards.map((c) => c.id),
                };
            } catch (error) {
                logger.error("Error loading cards for selectCards tool:", error);
                return {
                    success: false,
                    message: `Error selecting cards: ${error instanceof Error ? error.message : "Unknown error"}`,
                };
            }
        },
    };
}
