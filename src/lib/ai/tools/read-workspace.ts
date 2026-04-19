import { tool, zodSchema } from "ai";
import { z } from "zod";
import { loadStateForTool, resolveItem } from "./tool-utils";
import { resolveItemByPath } from "./workspace-search-utils";
import { formatItemContent } from "@/lib/utils/format-workspace-context";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import type { WorkspaceToolContext } from "./workspace-tools";
import type { DocumentData } from "@/lib/workspace-state/types";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

const ReadWorkspaceResultSchema = z.discriminatedUnion("success", [
    z.object({
        success: z.literal(false),
        message: z.string(),
    }),
    z.object({
        success: z.literal(true),
        itemName: z.string(),
        type: z.string(),
        path: z.string(),
        content: z.string(),
        totalLines: z.number().int().nonnegative(),
        lineStart: z.number().int().min(1),
        lineEnd: z.number().int().nonnegative(),
        hasMore: z.boolean(),
        rangeNote: z.string(),
        nextLineStart: z.number().int().min(1).optional(),
        totalPages: z.number().int().min(1).optional(),
        pageRange: z
            .object({
                start: z.number().int().min(1).optional(),
                end: z.number().int().min(1).optional(),
            })
            .optional(),
    }),
]);

export function createReadWorkspaceTool(ctx: WorkspaceToolContext) {
    return tool({
        description:
            "Read workspace item text by path or name (documents, flashcards, PDFs, quizzes, images, audio, websites, YouTube). Audio returns the segment timeline when present, not raw audio — paginate with lineStart/limit and nextLineStart when hasMore. " +
            "Lines have no prefixes (safe for item_edit oldText). rangeNote indicates full vs partial read. PDFs: pageStart/pageEnd. Long lines truncated at 2000 chars. Default limit 500, max 2000 lines per call.",
        inputSchema: zodSchema(
            z.object({
                path: z
                    .string()
                    .optional()
                    .describe(
                        "Virtual path (e.g. Physics/documents/Thermodynamics.md) — unambiguous when duplicates exist"
                    ),
                itemName: z
                    .string()
                    .optional()
                    .describe(
                        "Exact name (case-insensitive). If multiple items share the same name, use path to disambiguate. Pass a virtual path for unambiguous resolution."
                    ),
                lineStart: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("1-based line number to start from (default 1). Use with limit for pagination."),
                limit: z
                    .number()
                    .int()
                    .min(1)
                    .max(MAX_LIMIT)
                    .optional()
                    .describe(`Max lines to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}). Use with lineStart for pagination.`),
                pageStart: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("For PDFs only: 1-indexed start page (e.g. 5 for page 5). Use with pageEnd to read a page range."),
                pageEnd: z
                    .number()
                    .int()
                    .min(1)
                    .optional()
                    .describe("For PDFs only: 1-indexed end page inclusive (e.g. 10 for pages 5–10). Use with pageStart."),
            })
        ),
        outputSchema: zodSchema(ReadWorkspaceResultSchema),
        strict: true,
        execute: async ({ path, itemName, lineStart = 1, limit = DEFAULT_LIMIT, pageStart, pageEnd }) => {
            if (!path?.trim() && !itemName?.trim()) {
                return {
                    success: false,
                    message: "Either path or itemName is required",
                };
            }

            const accessResult = await loadStateForTool(ctx);
            if (!accessResult.success) return accessResult;

            const items = normalizeWorkspaceItems(accessResult.state);

            let item = null;

            if (path?.trim()) {
                item = resolveItemByPath(items, path.trim());
            }

            if (!item && itemName?.trim()) {
                const contentItems = items.filter((i) => i.type !== "folder");
                const resolved = resolveItem(contentItems, itemName.trim());
                if (resolved.ok) {
                    item = resolved.item;
                } else if (resolved.reason === "ambiguous") {
                    const paths = resolved.matches.map((m) => getVirtualPath(m, items)).join(", ");
                    return {
                        success: false,
                        message: `Multiple items named "${itemName}". Use path to disambiguate: ${paths}`,
                    };
                }
            }

            if (!item) {
                const contentItems = items.filter((i) => i.type !== "folder");
                const sample = contentItems.slice(0, 5).map((i) => getVirtualPath(i, items)).join(", ");
                return {
                    success: false,
                    message: `Item not found${itemName ? `: "${itemName}"` : ` at path: ${path}`}. ${
                        sample ? `Example paths: ${sample}` : "Workspace may be empty. Use workspace_search to search."
                    }`,
                };
            }

            if (item.type === "folder") {
                return {
                    success: false,
                    message: "Folders have no readable content. Use path to a document, flashcard, PDF, quiz, image, audio, website, or YouTube item.",
                };
            }

            const pdfPageRange =
                item.type === "pdf" && (pageStart != null || pageEnd != null)
                    ? { pageStart, pageEnd }
                    : undefined;

            const fullContent =
                item.type === "document"
                    ? ((item.data as DocumentData).markdown ?? "")
                    : formatItemContent(item, pdfPageRange);
            const allLines = fullContent.split(/\r?\n/);
            const totalLines = allLines.length;
            const startIdx = Math.max(0, lineStart - 1);
            const cappedLimit = Math.min(limit, MAX_LIMIT);
            const slice = allLines.slice(startIdx, startIdx + cappedLimit);
            const content = slice
                .map((line) =>
                    line.length > MAX_LINE_LENGTH
                        ? line.substring(0, MAX_LINE_LENGTH) + "..."
                        : line
                )
                .join("\n");
            const lineEnd = startIdx + slice.length;
            const hasMore = lineEnd < totalLines;

            const rangeNote =
                !hasMore && startIdx === 0 && slice.length === totalLines
                    ? "Full content"
                    : hasMore
                      ? `Lines ${startIdx + 1}–${lineEnd} of ${totalLines} (has more)`
                      : `Lines ${startIdx + 1}–${lineEnd} of ${totalLines}`;

            const vpath = getVirtualPath(item, items);

            const pdfOutputFields: {
                totalPages?: number;
                pageRange?: { start?: number; end?: number };
            } = {};
            if (item.type === "pdf") {
                const ocr = (item.data as { ocrPages?: unknown[] }).ocrPages;
                const ocrLen = Array.isArray(ocr) ? ocr.length : 0;
                if (ocrLen > 0) {
                    pdfOutputFields.totalPages = ocrLen;
                }
                if (pdfPageRange) {
                    pdfOutputFields.pageRange = {
                        start: pdfPageRange.pageStart,
                        end: pdfPageRange.pageEnd,
                    };
                }
            }

            return {
                success: true,
                itemName: item.name,
                type: item.type,
                path: vpath,
                content,
                totalLines,
                lineStart: startIdx + 1,
                lineEnd,
                hasMore,
                rangeNote,
                ...(hasMore && { nextLineStart: lineEnd + 1 }),
                ...pdfOutputFields,
            };
        },
    });
}
