import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { searchVideos } from "@/lib/youtube";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { withSanitizedModelOutput, loadStateForTool, resolveFolderByName } from "./tool-utils";

import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";

/**
 * Create the youtube_search tool
 */
export function createSearchYoutubeTool() {
    return tool({
        description: "Search for YouTube videos.",
        inputSchema: zodSchema(
            z.object({
                query: z.string().describe("The search query for YouTube videos"),
            })
        ),
        strict: true,
        execute: async ({ query }) => {
            logger.debug("📹 [YOUTUBE] Searching for:", query);
            try {
                const videos = await searchVideos(query);
                return {
                    success: true,
                    videos,
                };
            } catch (error) {
                logger.error("❌ [YOUTUBE] Search tool failed:", error);
                return {
                    success: false,
                    message: "Failed to search YouTube videos. Please try again later.",
                };
            }
        },
    });
}

/**
 * Create the youtube_add tool
 */
export function createAddYoutubeVideoTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Add a YouTube video to the workspace. Prefer videos under 1 hour for better engagement.",
        inputSchema: zodSchema(
            z.object({
                videoId: z.string().describe("The YouTube Video ID (not the full URL)"),
                title: z.string().describe("The title of the video"),
                folderName: z.string().optional().describe(
                    "Name of the folder to create this item in. If not provided, creates in the user's current folder view. Use this when you want to organize items into specific folders."
                ),
            })
        ),
        strict: true,
        execute: async ({ videoId, title, folderName }) => {
            logger.debug("📹 [YOUTUBE] Adding video:", { videoId, title });

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

            const url = `https://www.youtube.com/watch?v=${videoId}`;

            return await workspaceWorker("create", {
                workspaceId: ctx.workspaceId,
                title,
                itemType: "youtube",
                youtubeData: { url },
                folderId: targetFolderId,
            });
        },
    }));
}
