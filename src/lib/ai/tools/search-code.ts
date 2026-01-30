import { google } from "@ai-sdk/google";
import { z } from "zod";
import { tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";
import { codeExecutionWorker } from "@/lib/ai/workers";

/**
 * Create the googleSearch tool
 * Uses standard Google Search tool.
 */
export function createGoogleSearchTool() {
    return google.tools.googleSearch({});
}

/**
 * Create the executeCode tool
 */
export function createExecuteCodeTool() {
    return tool({
        description: "Execute Python code for calculations, data processing, algorithms, or mathematical computations.",
        inputSchema: zodSchema(
            z.object({
                task: z.string().describe("Description of the task to solve with code"),
            })
        ),
        execute: async ({ task }) => {
            logger.debug("🎯 [ORCHESTRATOR] Delegating to Code Execution Worker:", task);
            return await codeExecutionWorker(task);
        },
    });
}
