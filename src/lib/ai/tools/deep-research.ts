import { GoogleGenAI } from "@google/genai";
import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { workspaceWorker } from "@/lib/ai/workers";
import type { WorkspaceToolContext } from "./workspace-tools";
import { checkDeepResearchRateLimit, recordDeepResearchUsage } from "@/lib/services/rate-limit";

/**
 * Create the deepResearch tool
 */
export function createDeepResearchTool(ctx: WorkspaceToolContext) {
    return tool({
        description: "Perform deep, multi-step research on a complex topic. Use this when the user explicitly asks for 'deep research' or when a simple web search is insufficient for the depth required. This tool IMMEDIATELY creates a special research card in the workspace that will stream progress and display the final report. You should ask clarifying questions BEFORE calling this tool if the request is vague. Once ready, call this tool with the refined topic/prompt.",
        inputSchema: zodSchema(
            z.object({
                prompt: z.string().describe("The detailed research topic and instructions."),
            })
        ),
        execute: async ({ prompt }) => {
            logger.debug("🎯 [DEEP-RESEARCH] Starting deep research for:", prompt);

            try {
                // Check rate limit
                if (!ctx.userId) {
                    return { error: "Authentication required for deep research" };
                }

                const rateLimit = await checkDeepResearchRateLimit(ctx.userId);
                if (!rateLimit.allowed) {
                    const resetDate = rateLimit.resetAt;
                    let timeStr = "24 hours";
                    if (resetDate) {
                        const diffMs = resetDate.getTime() - Date.now();
                        const hours = Math.floor(diffMs / (1000 * 60 * 60));
                        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                        timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutes`;
                    }
                    return {
                        rateLimited: true,
                        resetAt: rateLimit.resetAt?.toISOString(),
                        userMessage: `You've reached your deep research limit (2 per 24 hours). Your limit resets in ${timeStr}. You can continue using the chat for other tasks - just deep research is temporarily unavailable.`,
                    };
                }

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

                // Record usage for rate limiting
                await recordDeepResearchUsage(ctx.userId, ctx.workspaceId, interaction.id, prompt);

                return {
                    noteId: noteResult.itemId,
                    interactionId: interaction.id,
                    message: "Deep research started. Check the new research card in your workspace to see progress.",
                };
            } catch (error: any) {
                logger.error("❌ [DEEP-RESEARCH] Error:", error);
                return {
                    error: error?.message || "Failed to start deep research"
                };
            }
        },
    });
}
