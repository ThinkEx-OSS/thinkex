import { z } from "zod";
import { tool, generateText, zodSchema } from "ai";
import { google } from "@ai-sdk/google";
import type { GoogleLanguageModelOptions } from "@ai-sdk/google";
import { getModelForPurpose } from "@/lib/ai/models";
import {
  EscalateModelResultSchema,
  type EscalateModelResult,
} from "@/lib/ai/escalate-model-shared";

/**
 * Delegate a complex reasoning task to a higher-intelligence model with extended thinking.
 */
export async function escalateToHigherModel(
  problem: string,
  options?: { abortSignal?: AbortSignal },
): Promise<EscalateModelResult> {
  const modelId = getModelForPurpose("escalation");

  const { text } = await generateText({
    model: google(modelId),
    abortSignal: options?.abortSignal,
    experimental_telemetry: { isEnabled: true },
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "high",
          includeThoughts: false,
        },
      } satisfies GoogleLanguageModelOptions,
    },
    system: `You are an expert reasoning assistant. Analyze the problem below thoroughly and precisely.

Think step by step. Consider edge cases. Verify your reasoning. If the problem involves math or logic, check your work.

Provide a clear, well-structured analysis followed by a definitive answer. Be thorough but concise.`,
    prompt: problem,
  });

  return {
    analysis: text.trim() || "No analysis produced.",
  };
}

export function createEscalateModelTool() {
  return tool({
    description: [
      "Escalate a complex reasoning problem to a higher-intelligence model with extended thinking capabilities.",
      "Use when a problem requires careful multi-step reasoning, complex analysis, or when you want to verify your thinking on a hard problem.",
      "Pass a self-contained problem description — the delegate does not see the chat history.",
    ].join(" "),
    inputSchema: zodSchema(
      z.object({
        problem: z
          .string()
          .min(1)
          .max(32_000)
          .describe(
            "Self-contained problem description with all necessary context, data, and constraints. The delegate model does not see the chat history.",
          ),
      }),
    ),
    strict: true,
    outputSchema: zodSchema(EscalateModelResultSchema),
    execute: async ({ problem }, { abortSignal }) => {
      return await escalateToHigherModel(problem, { abortSignal });
    },
  });
}
