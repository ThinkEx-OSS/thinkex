import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { searchVideos } from "@/lib/youtube";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";

/**
 * Create the searchYoutube tool
 */
export function createSearchYoutubeTool() {
    return tool({
        description: "Search for YouTube videos.",
        inputSchema: zodSchema(
            z.object({
                query: z.string().describe("The search query for YouTube videos"),
            })
        ),
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
 * Create the addYoutubeVideo tool
 */
export function createAddYoutubeVideoTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Add a YouTube video to the workspace. Prefer videos under 1 hour for better engagement.",
        inputSchema: zodSchema(
            z.object({
                videoId: z.string().describe("The YouTube Video ID (not the full URL)"),
                title: z.string().describe("The title of the video"),
            })
        ),
        execute: async ({ videoId, title }) => {
            logger.debug("📹 [YOUTUBE] Adding video:", { videoId, title });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            const url = `https://www.youtube.com/watch?v=${videoId}`;

            return await workspaceWorker("create", {
                workspaceId: ctx.workspaceId,
                title,
                itemType: "youtube",
                youtubeData: { url },
                folderId: ctx.activeFolderId,
            });
        },
    });
}
