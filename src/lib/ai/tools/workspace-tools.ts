import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { Item } from "@/lib/workspace-state/types";
import { loadStateForTool, resolveItem, resolveFolderByName, withSanitizedModelOutput } from "./tool-utils";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { sourceSchema } from "@/lib/workspace-state/item-data-schemas";

// Note: Edit functionality is in edit-item-tool.ts (item_edit)

export interface WorkspaceToolContext {
    workspaceId: string | null;
    userId: string | null;
    activeFolderId?: string;
    threadId?: string | null;
}

/**
 * Create the document_create tool
 */
export function createDocumentTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Create a document card. Documents use a rich TipTap editor with full markdown support (headings, lists, tables, math, etc.). Use this for longer-form structured content.",
        inputSchema: zodSchema(
            z.object({
                title: z.string().describe("The title of the document card"),
                content: z.string().describe("The markdown body content. CRITICAL: DO NOT repeat the title in content — the title is displayed separately. Start with subheadings or body text only."),
                sources: z.array(sourceSchema).optional().describe("Optional sources from web search or deep research"),
                folderName: z.string().optional().describe(
                    "Name of the folder to create this item in. If not provided, creates in the user's current folder view. Use this when you want to organize items into specific folders."
                ),
            })
        ),
        strict: true,
        execute: async ({ title, content, sources, folderName }) => {
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

            logger.debug("🎯 [ORCHESTRATOR] Delegating to Workspace Worker (create document):", {
                title,
                contentLength: content.length,
                sourcesCount: sources?.length,
            });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            let targetFolderId = ctx.activeFolderId;
            if (folderName !== undefined) {
                try {
                    const accessResult = await loadStateForTool(ctx);
                    if (!accessResult.success) return accessResult;
                    const state = normalizeWorkspaceItems(accessResult.state);
                    targetFolderId = resolveFolderByName(state, folderName, ctx.activeFolderId);
                } catch (error) {
                    return {
                        success: false,
                        message: error instanceof Error ? error.message : String(error),
                    };
                }
            }

            return await workspaceWorker("create", {
                workspaceId: ctx.workspaceId,
                title,
                content,
                sources,
                itemType: "document",
                folderId: targetFolderId,
            });
        },
    }));
}

/**
 * Create the item_delete tool
 */
export function createDeleteItemTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Delete one or more workspace items by name. This permanently removes them from the workspace.",
        inputSchema: zodSchema(
            z.object({
                itemNames: z
                    .array(z.string())
                    .min(1)
                    .describe(
                        "Array of item names or virtual paths to delete. Each is matched by fuzzy search."
                    ),
                itemName: z.string().optional().describe("Deprecated: use itemNames instead. Single item name for backward compatibility."),
            })
        ),
        strict: true,
        execute: async (rawInput: { itemNames?: string[]; itemName?: string }) => {
            const itemNames = rawInput.itemNames ?? (rawInput.itemName ? [rawInput.itemName] : []);
            if (itemNames.length === 0) {
                return { success: false, message: "At least one item name is required." };
            }

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            try {
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const state = normalizeWorkspaceItems(accessResult.state);

                const deleted: string[] = [];
                const failed: string[] = [];

                for (const itemName of itemNames) {
                    const matchedItem = resolveItem(state, itemName);
                    if (!matchedItem) {
                        failed.push(`"${itemName}" (not found)`);
                        continue;
                    }

                    try {
                        await workspaceWorker("delete", {
                            workspaceId: ctx.workspaceId,
                            itemId: matchedItem.id,
                        });
                        deleted.push(matchedItem.name);
                    } catch (err) {
                        failed.push(
                            `"${matchedItem.name}" (${err instanceof Error ? err.message : "error"})`,
                        );
                    }
                }

                if (deleted.length === 0) {
                    return {
                        success: false,
                        message: `Could not delete any items. Failed: ${failed.join(", ")}`,
                    };
                }

                const result: Record<string, unknown> = {
                    success: failed.length === 0,
                    deletedCount: deleted.length,
                    deletedItems: deleted,
                    message:
                        failed.length > 0
                            ? `Deleted ${deleted.length} item(s). Failed: ${failed.join(", ")}`
                            : deleted.length === 1
                                ? `Deleted "${deleted[0]}" successfully`
                                : `Deleted ${deleted.length} items successfully`,
                };

                if (failed.length > 0) {
                    result.failedItems = failed;
                }

                return result;
            } catch (error) {
                logger.error("Error deleting items:", error);
                return {
                    success: false,
                    message: `Error deleting items: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    }));
}
