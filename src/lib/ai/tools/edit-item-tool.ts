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
            "TARGETED EDIT: provide edits array with one or more {oldText, newText} pairs. Matches must be unique; whitespace/context fallbacks are supported. " +
            "MULTI-EDIT: successful edits may still apply even if some fail; in that case response includes applied/failed details with success=false. " +
            "FULL REWRITE: single edit with oldText='' and newText=entire new content (quizzes: only the JSON). " +
            "RENAME ONLY: empty edits array [] with newName='new name'. " +
            "PDFs: RENAME ONLY — empty edits array with newName. " +
            "QUIZZES: workspace_read may show '--- Progress (read-only) ---' at the top. That block is READ-ONLY. Only edit the {\"questions\":[...]} JSON.",
        inputSchema: zodSchema(
            z
                .object({
                    itemName: z
                        .string()
                        .describe("Name of the item to edit (document, flashcard deck, quiz, or PDF; matched by fuzzy search)"),
                    edits: z.array(z.object({
                        oldText: z.string().describe("Text to find in original content. Must be unique."),
                        newText: z.string().describe("Replacement text for this edit."),
                    })).describe(
                        "One or more targeted replacements. Prefer non-overlapping edits. For full rewrite: use one edit with oldText='' and full newText."
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
                const matchedItem = resolveItem(state, itemName);

                if (!matchedItem) {
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

                const contentItems = state.filter((i) => i.type !== "folder");
                const sameNameCandidates = contentItems.filter(
                    (i) => i.name.toLowerCase().trim() === matchedItem.name.toLowerCase().trim()
                );
                if (sameNameCandidates.length > 1) {
                    const paths = sameNameCandidates.map((c) => getVirtualPath(c, state)).join(", ");
                    return {
                        success: false,
                        message: `Multiple items named "${matchedItem.name}". Disambiguate using path: ${paths}`,
                    };
                }

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

                logger.debug("🎯 [EDIT-ITEM] Found item via fuzzy match:", {
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

                if (workerResult.success || (workerResult as { partialApplied?: boolean }).partialApplied) {
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
