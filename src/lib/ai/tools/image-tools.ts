import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { searchGoogleImages } from "@/lib/google-images";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";

/**
 * Create the searchImages tool
 */
export function createSearchImagesTool() {
    return tool({
        description: "Search for images on the web (Google Images).",
        inputSchema: zodSchema(
            z.object({
                query: z.string().describe("The search query for images"),
            })
        ),
        execute: async ({ query }) => {
            logger.debug("🖼️ [IMAGES] Searching for:", query);
            try {
                const images = await searchGoogleImages(query);
                return {
                    success: true,
                    images,
                };
            } catch (error: any) {
                // Handle specific MISSING_KEYS error to show friendly partial UI
                if (error.message === "MISSING_KEYS") {
                    return {
                        success: false,
                        message: "MISSING_KEYS", // Special code for UI
                        error: "Google Search API Key or CX is missing. Please configure them in .env"
                    };
                }

                logger.error("❌ [IMAGES] Search tool failed:", error);
                return {
                    success: false,
                    message: error.message || "Failed to search images.",
                };
            }
        },
    });
}

/**
 * Create the addImage tool
 */
export function createAddImageTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Add an image to the workspace from a URL.",
        inputSchema: zodSchema(
            z.object({
                url: z.string().describe("The full URL of the image"),
                title: z.string().describe("Title or description for the image card"),
                altText: z.string().optional().describe("Accessibility alt text"),
                width: z.number().optional().describe("Image width"),
                height: z.number().optional().describe("Image height"),
            })
        ),
        execute: async ({ url, title, altText, width, height }) => {
            logger.debug("🖼️ [IMAGES] Adding image:", { url, title });

            if (!ctx.workspaceId) {
                return {
                    success: false,
                    message: "No workspace context available",
                };
            }

            // Calculate initial layout if dimensions are known
            // Logic similar to WorkspaceHeader adaptive calculation could be here,
            // but workspaceWorker generally handles creation.
            // We pass dimensions in metadata or let the card handle it.
            // For now, we just pass the data.

            return await workspaceWorker("create", {
                workspaceId: ctx.workspaceId,
                title,
                itemType: "image",
                imageData: {
                    url,
                    altText: altText || title,
                    caption: title
                },
                folderId: ctx.activeFolderId,
            });
        },
    });
}
