import { GoogleGenAI } from "@google/genai";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { withSanitizedModelOutput } from "./tool-utils";

/**
 * Create the deepResearch tool
 */
export function createDeepResearchTool(ctx: WorkspaceToolContext) {
    return withSanitizedModelOutput(tool({
        description: "Perform deep, multi-step research. Creates a research card that streams progress.",
        inputSchema: zodSchema(
            z.object({
                prompt: z.string().describe("The detailed research topic and instructions."),
            })
        ),
        execute: async ({ prompt }) => {
            logger.debug("🎯 [DEEP-RESEARCH] Starting deep research for:", prompt);

            try {
                const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
                if (!apiKey) {
                    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
                }

                if (!ctx.workspaceId) {
                    throw new Error("No workspace context available");
                }

                const client = new GoogleGenAI({
                    apiKey: apiKey,
                });

                // Start the deep research interaction in background mode with thinking enabled
                const interaction = await client.interactions.create({
                    input: prompt,
                    agent: "deep-research-pro-preview-12-2025",
                    background: true,
                    agent_config: {
                        type: 'deep-research',
                        thinking_summaries: 'auto'
                    }
                });

                logger.debug("🎯 [DEEP-RESEARCH] Interaction started:", interaction.id);

                // Create a note with deep research metadata immediately
                const noteResult = await workspaceWorker("create", {
                    workspaceId: ctx.workspaceId,
                    title: `Research: ${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}`,
                    deepResearchData: {
                        prompt,
                        interactionId: interaction.id,
                    },
                    folderId: ctx.activeFolderId,
                });

                logger.debug("🎯 [DEEP-RESEARCH] Research note created:", noteResult.itemId);

                return {
                    success: true,
                    itemId: noteResult.itemId,
                    noteId: noteResult.itemId,
                    interactionId: interaction.id,
                    message: "Deep research started. Check the new research card in your workspace to see progress.",
                    event: noteResult.event,
                    version: noteResult.version,
                };
            } catch (error: any) {
                logger.error("❌ [DEEP-RESEARCH] Error:", error);
                return {
                    error: error?.message || "Failed to start deep research"
                };
            }
        },
    }));
}
