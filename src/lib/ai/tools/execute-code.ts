import { z } from "zod";
import { tool, generateText, stepCountIs, zodSchema, type ToolSet } from "ai";
import { google, type GoogleLanguageModelOptions } from "@ai-sdk/google";
import { buildCodeExecuteToolDescription } from "@/lib/ai/code-execute-environment";
import { getModelForPurpose } from "@/lib/ai/models";
import {
  CodeExecuteResultSchema,
  type CodeExecuteResult,
  type CodeExecuteStep,
} from "@/lib/ai/code-execute-shared";

const INNER_STEP_CAP = 12;

const codeTools = {
  codeExecution: google.tools.codeExecution({}),
} as ToolSet;

function buildStepsFromToolResults(
  toolResults: Array<{
    toolName: string;
    toolCallId: string;
    input: unknown;
    output: unknown;
  }>,
): CodeExecuteStep[] {
  const steps: CodeExecuteStep[] = [];
  for (const tr of toolResults) {
    if (tr.toolName !== "code_execution") continue;
    const input = tr.input as { language?: string; code?: string } | undefined;
    const output = tr.output as
      | { outcome?: string; output?: string }
      | undefined;
    steps.push({
      language: input?.language,
      code: input?.code,
      outcome: output?.outcome,
      output: output?.output ?? "",
    });
  }
  return steps;
}

/**
 * Run Gemini 3.1 Pro with Google code execution; return answer + optional execution steps.
 */
export async function executeCodeWithGemini(
  task: string,
  options?: { abortSignal?: AbortSignal },
): Promise<CodeExecuteResult> {
  const { text, toolResults } = await generateText({
    model: google(getModelForPurpose("code-execute")),
    tools: codeTools,
    stopWhen: stepCountIs(INNER_STEP_CAP),
    abortSignal: options?.abortSignal,
    experimental_telemetry: { isEnabled: true },
    providerOptions: {
      google: {
        thinkingConfig: {
          thinkingLevel: "low",
          includeThoughts: false,
        },
      } satisfies GoogleLanguageModelOptions,
    },
    prompt: `You are a precise assistant with access to Python code execution in a managed sandbox.

Solve the task below. Use the code execution tool when running Python would improve accuracy (math, data, verification). Use only libraries available in the Gemini code execution environment.

When finished, end with a concise summary the user can read (the final answer).

Task:
${task}`,
  });

  const steps = buildStepsFromToolResults(
    toolResults as Array<{
      toolName: string;
      toolCallId: string;
      input: unknown;
      output: unknown;
    }>,
  );

  const answer =
    typeof text === "string" && text.trim().length > 0
      ? text.trim()
      : steps.length > 0
        ? (steps[steps.length - 1]?.output ?? "").trim() ||
          "Execution finished with no summary text."
        : "No result from code execution.";

  return {
    answer,
    steps: steps.length > 0 ? steps : undefined,
  };
}

export function createExecuteCodeTool() {
  return tool({
    description: buildCodeExecuteToolDescription(),
    inputSchema: zodSchema(
      z.object({
        task: z
          .string()
          .min(1)
          .max(32_000)
          .describe(
            "Self-contained instructions and data for the Python sandbox. Include all numbers, tables, and constraints needed; the delegate does not see the chat history.",
          ),
      }),
    ),
    strict: true,
    outputSchema: zodSchema(CodeExecuteResultSchema),
    execute: async ({ task }, { abortSignal }) => {
      return await executeCodeWithGemini(task, { abortSignal });
    },
  });
}
