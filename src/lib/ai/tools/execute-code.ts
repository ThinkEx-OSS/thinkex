import { z } from "zod";
import { tool, zodSchema } from "ai";
import { Sandbox } from "@e2b/code-interpreter";

import { buildCodeExecuteToolDescription } from "@/lib/ai/code-execute-environment";
import {
  CodeExecuteResultSchema,
  type CodeExecuteResult,
  type CodeExecuteStep,
} from "@/lib/ai/code-execute-shared";

export async function executeCodeWithE2B(
  code: string,
  options?: { abortSignal?: AbortSignal },
): Promise<CodeExecuteResult> {
  options?.abortSignal?.throwIfAborted();

  const sandbox = await Sandbox.create();

  try {
    const execution = await sandbox.runCode(code);

    const steps: CodeExecuteStep[] = [
      {
        language: "python",
        code,
        outcome: execution.error ? "ERROR" : "OK",
        output: [...execution.logs.stdout, ...execution.logs.stderr].join("\n"),
      },
    ];

    const charts: { type: string; data: string }[] = [];

    for (const result of execution.results) {
      if (result.png) {
        charts.push({ type: "image/png", data: result.png });
      } else if (result.jpeg) {
        charts.push({ type: "image/jpeg", data: result.jpeg });
      } else if (result.svg) {
        charts.push({ type: "image/svg+xml", data: result.svg });
      }
    }

    const textParts = execution.results.map((result) => result.text).filter(Boolean);
    const answer = execution.error
      ? `Error: ${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`
      : textParts.join("\n") ||
        steps[0]?.output ||
        "Execution completed successfully.";

    return {
      answer,
      steps: steps.length > 0 ? steps : undefined,
      charts: charts.length > 0 ? charts : undefined,
    };
  } finally {
    await sandbox.kill();
  }
}

export function createExecuteCodeTool() {
  return tool({
    description: buildCodeExecuteToolDescription(),
    inputSchema: zodSchema(
      z.object({
        code: z
          .string()
          .min(1)
          .max(64_000)
          .describe(
            "Complete, runnable Python code. Use print() for text output. Use matplotlib plt.show() for charts. You can pip install packages inline with subprocess if needed.",
          ),
      }),
    ),
    strict: true,
    outputSchema: zodSchema(CodeExecuteResultSchema),
    execute: async ({ code }, { abortSignal }) => {
      return await executeCodeWithE2B(code, { abortSignal });
    },
  });
}
