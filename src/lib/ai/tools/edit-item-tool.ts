import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { loadStateForTool, resolveItem, withSanitizedModelOutput } from "./tool-utils";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { sourceSchema } from "@/lib/workspace-state/item-data-schemas";

const EDITABLE_TYPES = ["flashcard", "quiz", "pdf", "document"] as const;

/**
 * Create the item_edit tool - unified edit for documents, flashcards, quizzes, and PDFs.
 * Uses edits[] multi-edit pattern on raw content from workspace_read.
 * PDFs support RENAME ONLY: empty edits array with newName.
 */
export function createEditItemTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description:
            "Edit a document, flashcard deck, quiz, or PDF. You must use workspace_read at least once before editing. " +
            "TARGETED EDIT: provide edits array with one or more {oldText, newText} pairs. Each oldText must match exactly and uniquely in the original content. Copy from workspace_read as-is. When changing multiple separate sections, use one call with multiple edits[] entries instead of multiple calls. " +
            "FULL REWRITE: single edit with oldText='' and newText=entire new content (quizzes: only the JSON). " +
            "RENAME ONLY: empty edits array [] with newName='new name'. " +
            "PDFs: RENAME ONLY — empty edits array with newName. " +
            "QUIZZES: workspace_read may show '--- Progress (read-only) ---' at the top. That block is READ-ONLY. Only edit the {\"questions\":[...]} JSON.",
        inputSchema: zodSchema(
            z
                .object({
                    itemName: z
                        .string()
                        .describe("Exact name (case-insensitive) or virtual path of a document, flashcard deck, quiz, or PDF. Folders and other non-editable types are ignored. If multiple editable items share the same name, pass a virtual path to disambiguate."),
                    edits: z.array(z.object({
                        oldText: z.string().describe("Exact text to find in the original content. Must be unique. Copy from workspace_read as-is."),
                        newText: z.string().describe("Replacement text for this edit."),
                    })).describe(
                        "One or more targeted replacements. Each edit is matched against the original content, not incrementally. Do not include overlapping edits. If two changes touch the same block or nearby lines, merge them into one edit instead. For full rewrite: use a single edit with oldText='' and newText=entire new content."
                    ),
                    newName: z.string().optional().describe("Rename the item to this. If not provided, the existing name is preserved."),
                    sources: z
                        .array(sourceSchema)
                        .optional()
                        .describe("Optional sources to attach to the edited item"),
                })
                .passthrough()
        ),
        strict: true,
        execute: async (input: {
            itemName: string;
            edits: Array<{ oldText: string; newText: string }>;
            newName?: string;
            sources?: Array<{ title: string; url: string; favicon?: string }>;
        }) => {
            const { itemName, edits, newName } = input;

            if (!itemName) {
                return {
                    success: false,
                    message: "itemName is required to identify which item to edit.",
                };
            }

            const isRenameOnly = Boolean(newName) && edits.length === 0;

            if (!isRenameOnly && edits.length === 0) {
                return {
                    success: false,
                    message: "edits array is empty and no newName provided. Provide at least one edit or a newName for rename-only.",
                };
            }

            for (let i = 0; i < edits.length; i++) {
                const e = edits[i];
                if (e.oldText !== "" && e.oldText === e.newText) {
                    return {
                        success: false,
                        message: edits.length === 1
                            ? `No changes to apply: oldText and newText are identical.`
                            : `No changes to apply: edits[${i}].oldText and newText are identical.`,
                    };
                }
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
                const editableItems = state.filter((i) =>
                    EDITABLE_TYPES.includes(i.type as (typeof EDITABLE_TYPES)[number]),
                );
                const resolved = resolveItem(editableItems, itemName);
                if (!resolved.ok) {
                    if (resolved.reason === "ambiguous") {
                        const paths = resolved.matches
                            .map((m) => getVirtualPath(m, state))
                            .join(", ");
                        return {
                            success: false,
                            message: `Multiple items named "${itemName}". Disambiguate using path: ${paths}`,
                        };
                    }
                    const sample = state
                        .filter((i) => i.type !== "folder")
                        .slice(0, 5)
                        .map((i) => `"${i.name}" (${i.type})`)
                        .join(", ");
                    return {
                        success: false,
                        message: `Could not find item "${itemName}". ${sample ? `Example items: ${sample}` : "Workspace may be empty."}`,
                    };
                }
                const matchedItem = resolved.item;

                if (!EDITABLE_TYPES.includes(matchedItem.type as (typeof EDITABLE_TYPES)[number])) {
                    return {
                        success: false,
                        message: `Item "${matchedItem.name}" is not editable (type: ${matchedItem.type}). Only documents, flashcards, quizzes, and PDFs can be edited.`,
                    };
                }

                if (matchedItem.type === "pdf" && !isRenameOnly) {
                    return {
                        success: false,
                        message: "PDFs can only be renamed, not edited. Use empty edits array [] with newName='new name'.",
                    };
                }

                logger.debug("🎯 [EDIT-ITEM] Resolved item for edit:", {
                    searchedName: itemName,
                    matchedName: matchedItem.name,
                    matchedId: matchedItem.id,
                    type: matchedItem.type,
                });

                const workerResult = await workspaceWorker("edit", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedItem.id,
                    itemType: matchedItem.type as "flashcard" | "quiz" | "pdf" | "document",
                    itemName: matchedItem.name,
                    edits,
                    newName,
                    sources: input.sources,
                });

                if (workerResult.success) {
                    return {
                        ...workerResult,
                        itemName: newName ?? matchedItem.name,
                    };
                }

                return workerResult;
            } catch (error) {
                logger.error("Error editing item:", error);
                return {
                    success: false,
                    message: `Error editing item: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    }));
}
