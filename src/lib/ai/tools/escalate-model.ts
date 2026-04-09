import { z } from "zod";
import { tool, zodSchema } from "ai";
import {
  EscalateModelResultSchema,
  type EscalateModelResult,
} from "@/lib/ai/escalate-model-shared";

/**
 * Signal tool — calling this triggers a model switch via prepareStep in the chat route.
 * The tool itself does no LLM work; it just returns an acknowledgment.
 */
export function createEscalateModelTool() {
  return tool({
    description: [
      "Escalate to a higher-intelligence model for the remainder of this response.",
      "Call this when the current problem requires deeper reasoning, complex analysis, or careful verification.",
      "After calling, you will be upgraded to a more capable model that will continue the response with full context.",
    ].join(" "),
    inputSchema: zodSchema(
      z.object({
        reason: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "Brief explanation of why escalation is needed (e.g. 'complex multi-step math proof', 'nuanced legal analysis')",
          ),
      }),
    ),
    strict: true,
    outputSchema: zodSchema(EscalateModelResultSchema),
    execute: async ({ reason }): Promise<EscalateModelResult> => {
      return { escalated: true, reason };
    },
  });
}
