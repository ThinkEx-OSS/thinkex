import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { searchWorker, codeExecutionWorker } from "@/lib/ai/workers";

/**
 * Create the searchWeb tool
 */
export function createSearchWebTool() {
    return {
        description: "Search the web for current information, facts, news, or research. Use this when you need up-to-date information from the internet.",
        inputSchema: z.object({
            query: z.string().describe("The search query"),
        }),
        execute: async ({ query }: { query: string }) => {
            return await searchWorker(query);
        },
    };
}

/**
 * Create the executeCode tool
 */
export function createExecuteCodeTool() {
    return {
        description: "Execute Python code for calculations, data processing, algorithms, or mathematical computations.",
        inputSchema: z.object({
            task: z.string().describe("Description of the task to solve with code"),
        }),
        execute: async ({ task }: { task: string }) => {
            logger.debug("🎯 [ORCHESTRATOR] Delegating to Code Execution Worker:", task);
            return await codeExecutionWorker(task);
        },
    };
}
