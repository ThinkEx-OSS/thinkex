import { tool, zodSchema } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, workspaceItemContent } from "@/lib/db/client";
import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";
import { loadStateForTool } from "./tool-utils";
import { getVirtualPath } from "@/lib/utils/workspace-fs";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import type { WorkspaceToolContext } from "./workspace-tools";

const SIMILARITY_THRESHOLD = 0.6;

export function createSemanticSearchWorkspaceTool(ctx: WorkspaceToolContext) {
  return tool({
    description:
      "Semantic search across workspace items using vector similarity. Use this when you don't know exact keywords — finds content related to a concept or question even without exact term matches. Complements workspace_search (exact/regex). Only returns items that have been processed (PDFs with OCR). Returns items ranked by relevance.",
    inputSchema: zodSchema(
      z.object({
        query: z.string().describe("Conceptual query or question to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Max results to return (default 5)"),
      }),
    ),
    outputSchema: zodSchema(
      z.discriminatedUnion("success", [
        z.object({
          success: z.literal(false),
          message: z.string(),
        }),
        z.object({
          success: z.literal(true),
          results: z.array(
            z.object({
              name: z.string(),
              type: z.string(),
              path: z.string(),
              score: z.number(),
            }),
          ),
          output: z.string(),
        }),
      ]),
    ),
    strict: true,
    execute: async ({ query, limit = 5 }) => {
      if (!query?.trim()) {
        return { success: false as const, message: "query is required" };
      }

      if (!ctx.workspaceId) {
        return { success: false as const, message: "No workspace context." };
      }

      const accessResult = await loadStateForTool(ctx);
      if (!accessResult.success) {
        return { success: false as const, message: accessResult.message };
      }

      const state = normalizeWorkspaceItems(accessResult.state);
      const itemMap = new Map(state.map((i) => [i.id, i]));

      let queryEmbedding: number[];
      let rows: { itemId: string; embedData: unknown }[];

      try {
        [queryEmbedding, rows] = await Promise.all([
          embedText(query),
          db
            .select({
              itemId: workspaceItemContent.itemId,
              embedData: workspaceItemContent.embedData,
            })
            .from(workspaceItemContent)
            .where(eq(workspaceItemContent.workspaceId, ctx.workspaceId)),
        ]);
      } catch {
        return {
          success: false as const,
          message:
            "Semantic search unavailable. Use workspace_search for exact matches.",
        };
      }

      const results = rows
        .filter((r) =>
          Array.isArray((r.embedData as { vector?: number[] })?.vector),
        )
        .map((r) => {
          const item = itemMap.get(r.itemId);
          if (!item) return null;
          return {
            item,
            score: cosineSimilarity(
              queryEmbedding,
              (r.embedData as { vector: number[] }).vector,
            ),
          };
        })
        .filter(
          (r): r is NonNullable<typeof r> =>
            r !== null && r.score > SIMILARITY_THRESHOLD,
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((r) => ({
          name: r.item.name,
          type: r.item.type,
          path: getVirtualPath(r.item, state),
          score: Math.round(r.score * 100) / 100,
        }));

      if (results.length === 0) {
        return {
          success: true as const,
          results: [],
          output: `No semantically similar content found for "${query}". Try workspace_search for exact matches.`,
        };
      }

      const outputLines = [
        `Found ${results.length} semantically similar item${results.length === 1 ? "" : "s"}:`,
        ...results.map((r) => `  ${r.path} (${r.type}, score: ${r.score})`),
      ];

      return {
        success: true as const,
        results,
        output: outputLines.join("\n"),
      };
    },
  });
}
