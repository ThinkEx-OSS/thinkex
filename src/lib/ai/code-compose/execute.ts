/**
 * Code Compose — LLM writes JS to orchestrate multiple tools in a V8 sandbox.
 *
 * This is the core of Code Mode for ThinkEx. It registers as a standard AI SDK tool
 * (`code_compose`) that the LLM can call alongside direct tools.
 *
 * Flow:
 * 1. LLM writes JavaScript code that calls external_* functions
 * 2. Code is executed in an isolated-vm sandbox (separate V8 instance)
 * 3. external_* calls bridge to real tool executors on the host
 * 4. Final return value is sent back as the tool result
 */

import { tool, zodSchema } from "ai";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { withSanitizedModelOutput } from "../tools/tool-utils";
import { stripTypeAnnotations } from "./strip-types";
import {
  buildToolExecutorMap,
  injectToolBridge,
  type ExternalCallTrace,
} from "./tool-bridge";
import { generateTypeStubs } from "./type-stubs";

const ISOLATE_MEMORY_MB = 128;
const EXECUTION_TIMEOUT_MS = 30_000;

let _ivm: typeof import("isolated-vm") | null = null;

async function getIvm() {
  if (!_ivm) {
    const mod: any = await import("isolated-vm");
    _ivm = mod.default ?? mod;
  }
  return _ivm!;
}

export const CodeComposeResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  trace: z
    .object({
      externalCalls: z
        .array(
          z.object({
            functionName: z.string(),
            canonicalTool: z.string(),
            durationMs: z.number(),
            error: z.string().optional(),
          }),
        )
        .optional(),
      totalDurationMs: z.number(),
    })
    .optional(),
});

export type CodeComposeResult = z.infer<typeof CodeComposeResultSchema>;

function buildCodeComposeDescription(): string {
  const stubs = generateTypeStubs();

  return `Execute JavaScript code in a secure V8 sandbox to orchestrate multiple tools in a single step.

USE THIS WHEN: you need to call multiple tools and combine their results — especially when calls can be parallelized with Promise.all(), when you need to aggregate/transform data (sums, averages, filtering), or when the task involves loops or conditionals across tool results.

DO NOT USE THIS WHEN: a single direct tool call suffices, or you need to create/edit workspace items one at a time with user confirmation between steps.

RULES:
- Write JavaScript (not TypeScript). No import/require/eval.
- The code must end with a return statement — the returned value becomes the tool result.
- All external_* functions are async. Always await them.
- Use Promise.all() to parallelize independent calls.
- Math, string ops, JSON parsing, array methods all work natively in the JS runtime.
- Execution timeout: 30 seconds. Memory limit: 128MB.
- If an external_* call fails, it returns { success: false, message: "..." } — handle errors gracefully.
- Use console_log() for debug output (visible in execution trace, not shown to user).

AVAILABLE FUNCTIONS:
\`\`\`typescript
${stubs}
\`\`\``;
}

async function executeInSandbox(
  code: string,
  tools: Record<string, any>,
): Promise<CodeComposeResult> {
  const startTime = performance.now();
  const traces: ExternalCallTrace[] = [];

  let jsCode: string;
  try {
    jsCode = await stripTypeAnnotations(code);
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse code: ${err instanceof Error ? err.message : String(err)}`,
      trace: { totalDurationMs: performance.now() - startTime },
    };
  }

  const ivm = await getIvm();
  const isolate = new (ivm as any).Isolate({ memoryLimit: ISOLATE_MEMORY_MB });

  try {
    const context = await isolate.createContext();

    await injectToolBridge(ivm, context, buildToolExecutorMap(tools), traces);

    const wrappedCode = `
      (async () => {
        ${jsCode}
      })();
    `;

    const script = await isolate.compileScript(wrappedCode);
    const rawResult = await script.run(context, {
      timeout: EXECUTION_TIMEOUT_MS,
      result: { copy: true, promise: true },
    });

    const totalDurationMs = performance.now() - startTime;

    logger.info("[CODE-COMPOSE] Execution complete", {
      durationMs: Math.round(totalDurationMs),
      externalCalls: traces.length,
    });

    return {
      success: true,
      result: rawResult,
      trace: {
        externalCalls: traces.map(
          ({ functionName, canonicalTool, durationMs, error }) => ({
            functionName,
            canonicalTool,
            durationMs: Math.round(durationMs),
            ...(error && { error }),
          }),
        ),
        totalDurationMs: Math.round(totalDurationMs),
      },
    };
  } catch (err) {
    const totalDurationMs = performance.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    logger.error("[CODE-COMPOSE] Sandbox execution failed", {
      error: errorMsg,
      durationMs: Math.round(totalDurationMs),
      externalCalls: traces.length,
    });

    return {
      success: false,
      error: errorMsg,
      trace: {
        externalCalls: traces.map(
          ({ functionName, canonicalTool, durationMs, error }) => ({
            functionName,
            canonicalTool,
            durationMs: Math.round(durationMs),
            ...(error && { error }),
          }),
        ),
        totalDurationMs: Math.round(totalDurationMs),
      },
    };
  } finally {
    isolate.dispose();
  }
}

export function createCodeComposeTool(tools: Record<string, any>) {
  return withSanitizedModelOutput(
    tool({
      description: buildCodeComposeDescription(),
      inputSchema: zodSchema(
        z.object({
          code: z
            .string()
            .min(1)
            .max(32_000)
            .describe(
              "JavaScript code to execute. Must end with a return statement. Use external_* functions to call tools. Use Promise.all() for parallel calls.",
            ),
        }),
      ),
      strict: true,
      outputSchema: zodSchema(CodeComposeResultSchema),
      execute: async ({ code }) => {
        return await executeInSandbox(code, tools);
      },
    }),
  );
}
