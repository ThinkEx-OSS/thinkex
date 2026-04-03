import { google } from "@ai-sdk/google";
import { z } from "zod";
import { generateText, tool, zodSchema } from "ai";
import { logger } from "@/lib/utils/logger";

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
        outputSchema: z.string(),
        strict: true,
        execute: async ({ task }) => {
            logger.debug("🎯 [EXECUTE-CODE] Starting code execution:", task);

            const result = await generateText({
                model: google("gemini-2.5-flash"),
                tools: {
                    code_execution: google.tools.codeExecution({}),
                },
                prompt: `${task}

Use Python code execution to solve this problem. Show your work and explain the result.`,
            });

            logger.debug("🎯 [EXECUTE-CODE] Code execution completed");
            return result.text;
        },
    });
}
