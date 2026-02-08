import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import { loadStateForTool, fuzzyMatchItem, getAvailableItemsList } from "./tool-utils";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { PdfData } from "@/lib/workspace-state/types";

/**
 * Create the updatePdfContent tool
 * Allows the agent to cache extracted text content on a PDF workspace item
 * without re-processing the file through Gemini.
 * 
 * Primary use case: after Gemini reads a PDF inline (via composer file attachment),
 * the agent calls this to persist its understanding so future interactions
 * can reference the content without reprocessing.
 */
export function createUpdatePdfContentTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Cache/update the extracted text content of a PDF in the workspace. Use this after you've read a PDF (e.g. from a file attachment) to save your understanding so it doesn't need to be reprocessed later. Also used by processFiles to auto-cache results.",
        inputSchema: zodSchema(
            z.object({
                pdfName: z.string().describe("The name of the PDF item in the workspace (fuzzy matched)"),
                textContent: z.string().describe("The extracted/summarized text content of the PDF to cache"),
                title: z.string().optional().describe("Optional new title for the PDF item"),
            })
        ),
        execute: async ({ pdfName, textContent, title }) => {
            if (!pdfName) {
                return { success: false, message: "PDF name is required." };
            }
            if (!textContent) {
                return { success: false, message: "Text content is required." };
            }
            if (!ctx.workspaceId) {
                return { success: false, message: "No workspace context available" };
            }

            try {
                const accessResult = await loadStateForTool(ctx);
                if (!accessResult.success) {
                    return accessResult;
                }

                const { state } = accessResult;
                const matchedPdf = fuzzyMatchItem(state.items, pdfName, "pdf");

                if (!matchedPdf) {
                    const availablePdfs = getAvailableItemsList(state.items, "pdf");
                    return {
                        success: false,
                        message: `Could not find PDF "${pdfName}". ${availablePdfs ? `Available PDFs: ${availablePdfs}` : 'No PDFs found in workspace.'}`,
                    };
                }

                logger.debug("📄 [UPDATE-PDF-CONTENT] Found PDF via fuzzy match:", {
                    searchedName: pdfName,
                    matchedName: matchedPdf.name,
                    matchedId: matchedPdf.id,
                });

                const result = await workspaceWorker("updatePdfContent", {
                    workspaceId: ctx.workspaceId,
                    itemId: matchedPdf.id,
                    pdfTextContent: textContent,
                    title,
                });

                if (result.success) {
                    return {
                        ...result,
                        pdfName: matchedPdf.name,
                    };
                }

                return result;
            } catch (error) {
                logger.error("Error updating PDF content:", error);
                return {
                    success: false,
                    message: `Error updating PDF content: ${error instanceof Error ? error.message : String(error)}`,
                };
            }
        },
    });
}
