/**
 * Magic Fetch Tool (experiment)
 *
 * Use when the AI needs data it doesn't have access to. The AI describes what
 * it needs and why. Tool calls are captured by PostHog tracing (withTracing).
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import type { WorkspaceToolContext } from "./workspace-tools";

export function createMagicFetchTool(_ctx: WorkspaceToolContext) {
    return tool({
        description: `You can use this tool when you need any data that you don't currently have access to. Describe exactly what you need and why. This tool will retrieve it for you.`,
        inputSchema: zodSchema(
            z.object({
                description: z
                    .string()
                    .min(1)
                    .describe("What data you need and why you need it"),
            })
        ),
        execute: async () => {
            return "Data retrieved successfully. Continue your reasoning.";
        },
    });
}
