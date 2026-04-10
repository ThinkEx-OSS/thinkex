/**
 * Tool Bridge — connects isolated-vm sandbox functions to real tool executors.
 *
 * Each external_* function in the sandbox is an ivm.Reference that:
 * 1. Receives JSON-serialized arguments from the isolate
 * 2. Runs the real tool executor on the host
 * 3. Returns JSON-serialized results back to the isolate
 *
 * This is the only escape hatch from the sandbox — all I/O goes through here.
 */

import ivm from "isolated-vm";
import { logger } from "@/lib/utils/logger";
import { SANDBOX_TO_CANONICAL } from "./type-stubs";

/** Represents a registered tool executor (the .execute function from the AI SDK tool) */
export interface ToolExecutor {
  execute: (input: any, options?: any) => Promise<any>;
}

/** Map of sandbox function name → executor */
export type ToolExecutorMap = Map<string, ToolExecutor>;

/**
 * Execution trace entry for a single external_* call inside the sandbox.
 */
export interface ExternalCallTrace {
  functionName: string;
  canonicalTool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  error?: string;
}

/**
 * Build a tool executor map from the tools object returned by createChatTools().
 *
 * Extracts the `.execute` function from each AI SDK tool definition.
 * Only includes tools that are exposed in the sandbox (11 of 12 — excludes code_execute).
 */
export function buildToolExecutorMap(
  tools: Record<string, any>,
): ToolExecutorMap {
  const map: ToolExecutorMap = new Map();

  for (const [sandboxName, canonicalName] of Object.entries(
    SANDBOX_TO_CANONICAL,
  )) {
    const tool = tools[canonicalName];
    if (tool && typeof tool.execute === "function") {
      map.set(sandboxName, { execute: tool.execute });
    } else {
      logger.warn(
        `[CODE-COMPOSE] Tool "${canonicalName}" not found or missing execute(), skipping bridge for external_${sandboxName}`,
      );
    }
  }

  return map;
}

/**
 * Inject external_* functions into an isolate context.
 *
 * For each tool in the executor map, creates a global function in the isolate:
 *   external_<name>(jsonArgs) → Promise<jsonResult>
 *
 * The function is an ivm.Reference that crosses the isolate boundary:
 * - Arguments are JSON strings (serialized in isolate, parsed on host)
 * - Return values are JSON strings (serialized on host, parsed in isolate)
 * - Errors are caught and returned as { success: false, message: "..." }
 *
 * Also injects console_log for debugging.
 */
export async function injectToolBridge(
  context: ivm.Context,
  executorMap: ToolExecutorMap,
  traces: ExternalCallTrace[],
): Promise<void> {
  const jail = context.global;

  await jail.set(
    "_host_console_log",
    new ivm.Reference((...args: any[]) => {
      const msg = args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" ");
      logger.debug(`[CODE-COMPOSE:console] ${msg}`);
    }),
  );

  await context.eval(`
    globalThis.console_log = function(...args) {
      _host_console_log.applySync(undefined, args.map(a => typeof a === "string" ? a : JSON.stringify(a)));
    };
  `);

  for (const [sandboxName, executor] of executorMap) {
    const canonicalName = SANDBOX_TO_CANONICAL[sandboxName]!;

    const hostFn = new ivm.Reference(async (argsJson: string) => {
      const start = performance.now();
      let input: unknown;
      let output: unknown;

      try {
        input = JSON.parse(argsJson);
        output = await executor.execute(input);
        const durationMs = performance.now() - start;

        traces.push({
          functionName: sandboxName,
          canonicalTool: canonicalName,
          input,
          output,
          durationMs,
        });

        return JSON.stringify(output);
      } catch (err) {
        const durationMs = performance.now() - start;
        const errorMsg = err instanceof Error ? err.message : String(err);

        traces.push({
          functionName: sandboxName,
          canonicalTool: canonicalName,
          input,
          output: { success: false, message: errorMsg },
          durationMs,
          error: errorMsg,
        });

        return JSON.stringify({ success: false, message: errorMsg });
      }
    });

    await jail.set(`_host_${sandboxName}`, hostFn);
    await context.eval(`
      globalThis.external_${sandboxName} = async function(input) {
        const argsJson = JSON.stringify(input);
        const resultJson = await _host_${sandboxName}.apply(undefined, [argsJson], { result: { promise: true } });
        return JSON.parse(resultJson);
      };
    `);
  }
}
