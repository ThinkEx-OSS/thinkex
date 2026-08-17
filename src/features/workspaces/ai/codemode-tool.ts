import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import type { JSONValue, ToolSet } from "ai";
import { z } from "zod";

import {
	defineAIThreadTool,
	requireAIThreadToolRuntime,
} from "#/features/workspaces/ai/ai-thread-tool";
// Pure TS despite the components path (strings in, strings out) — the same
// summarizer the chat rows use, so a nested call reads identically to a
// direct one.
import { getFinishedToolSummary } from "#/features/workspaces/components/ai-chat/ai-chat-tool-summaries";

/**
 * The namespace generated code uses to call tools (`tools.web_search(...)`).
 * "codemode" is reserved for the platform SDK's own helpers.
 */
const CODEMODE_TOOL_NAMESPACE = "tools";

/**
 * Tools that must not be callable from generated code:
 * - `workspace_delete_items`: deletion stays a direct, per-call-visible tool so
 *   one bad generated loop cannot mass-delete items in a single opaque run.
 * - `activate_skill`: its output is guidance meant to land in the model's
 *   context verbatim; routing it through a code result would mangle it.
 */
const CODEMODE_EXCLUDED_TOOLS = new Set(["workspace_delete_items", "activate_skill"]);

/** Bounds what one run may persist and feed back to the model. */
const MAX_RESULT_CHARS = 16_000;
const MAX_LOG_ENTRIES = 50;
const MAX_LOG_CHARS = 2_000;
const MAX_ERROR_CHARS = 4_000;

const CODEMODE_DESCRIPTION = `Run JavaScript to do calculations or drive several tools in one pass: bulk reads, cross-item synthesis, data aggregation, anything with loops or arithmetic. Prefer this over chaining many individual tool calls, and use it for any non-trivial math — compute, don't estimate.

Available inside the code:
{{types}}

Write a single async arrow function in plain JavaScript (no TypeScript syntax, no named function definitions). Only its return value and console output come back to the conversation — return compact summaries, not full document contents.

Example: async () => { const found = await tools.web_search({ query: "spaced repetition" }); return found.results.slice(0, 3); }`;

const codemodeInputSchema = z.object({
	title: z
		.string()
		.min(1)
		.max(80)
		.describe(
			'Short plain-language label shown to the user while the code runs, e.g. "Calculating your quiz average". No jargon, no code.',
		),
	code: z.string().min(1).describe("JavaScript async arrow function to execute."),
});

const codemodeCallActionSchema = z.object({
	kind: z.literal("document-edit"),
	itemId: z.string(),
	path: z.string(),
	receiptId: z.string(),
	lineChanges: z.object({ added: z.number(), removed: z.number() }).optional(),
});

const codemodeCallSchema = z.object({
	/** Drives the app's review controls; stripped from the model's view. */
	action: codemodeCallActionSchema.optional(),
	toolName: z.string(),
	status: z.enum(["completed", "failed"]),
	/** The chat-row one-liner for this call; stripped from the model's view. */
	summary: z.string().optional(),
	error: z.string().optional(),
});

const codemodeOutputSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("completed"),
		result: z.unknown(),
		resultTruncated: z.boolean().optional(),
		calls: z.array(codemodeCallSchema),
		logs: z.array(z.string()).optional(),
	}),
	z.object({
		status: z.literal("error"),
		error: z.string(),
		calls: z.array(codemodeCallSchema),
		logs: z.array(z.string()).optional(),
	}),
]);

/** One nested tool call made by a codemode run, as persisted in the tool part. */
export type AiCodemodeCall = z.output<typeof codemodeCallSchema>;

/** The codemode tool's persisted output. */
export type AiCodemodeOutput = z.output<typeof codemodeOutputSchema>;

/** Live progress for one nested call inside a codemode run. */
export interface AiCodemodeActivityEvent {
	/** The outer codemode tool call this activity belongs to. */
	invocationId: string;
	/** The model-authored run label. */
	title: string;
	call: {
		index: number;
		toolName: string;
		status: "running" | "completed" | "failed";
	};
}

export type AiCodemodeActivityListener = (event: AiCodemodeActivityEvent) => void;

/**
 * The chat's Code Mode tool: the model writes JavaScript that orchestrates the
 * thread's other tools inside a network-blocked dynamic Worker isolate. Only
 * the code's return value, console output, and compact per-call records come
 * back; nested tool calls execute host-side through the wrapped tools, so
 * access checks, observability, and receipts behave exactly as direct calls.
 *
 * @param input - The env (for the `LOADER` worker-loader binding), the already
 *   capability-filtered tool set to expose, and an optional live-progress
 *   listener for the UI stream.
 * @returns An AI SDK tool taking `{ title, code }`.
 */
export function createAiChatCodemodeTool(input: {
	env: Cloudflare.Env;
	tools: ToolSet;
	onActivity?: AiCodemodeActivityListener;
}) {
	// The tool a provider sees is deliberately lossy: defineAIThreadTool drops
	// `outputSchema` and wraps the input in a lazy provider-portable schema
	// that Code Mode's synchronous type generator renders as `unknown`. Code
	// Mode hands the model TypeScript, not a provider dialect, so swap in the
	// original schemas from the tool runtime — they render faithfully.
	const eligible: ToolSet = Object.fromEntries(
		Object.entries(input.tools)
			.filter(
				([name, aiTool]) =>
					!CODEMODE_EXCLUDED_TOOLS.has(name) && typeof aiTool.execute === "function",
			)
			.map(([name, aiTool]) => {
				const runtime = requireAIThreadToolRuntime(name, aiTool);
				return [
					name,
					{ ...aiTool, inputSchema: runtime.inputSchema, outputSchema: runtime.outputSchema },
				];
			}),
	);
	const executor = new DynamicWorkerExecutor({
		loader: input.env.LOADER,
		// Generated code gets no network of its own; tools run host-side.
		globalOutbound: null,
	});
	// Built once for the type block in the model-facing description; execution
	// uses a per-invocation instance so call records can't interleave across
	// concurrent runs.
	const description = createCodeTool({
		tools: [{ name: CODEMODE_TOOL_NAMESPACE, tools: eligible }],
		executor,
		description: CODEMODE_DESCRIPTION,
	}).description;

	if (typeof description !== "string") {
		throw new Error("Code Mode did not produce a tool description");
	}

	return defineAIThreadTool({
		description,
		inputSchema: codemodeInputSchema,
		outputSchema: codemodeOutputSchema,
		toModelOutput: ({ output }) => ({
			type: "json" as const,
			value: getCodemodeModelOutput(output),
		}),
		execute: async ({ title, code }, context) => {
			const calls: AiCodemodeCall[] = [];
			let callIndex = 0;

			const emit = (
				index: number,
				toolName: string,
				status: "running" | "completed" | "failed",
			) => {
				input.onActivity?.({
					invocationId: context.invocationId,
					title,
					call: { index, toolName, status },
				});
			};

			const instrumented: ToolSet = Object.fromEntries(
				Object.entries(eligible).map(([name, aiTool]) => {
					const execute = aiTool.execute;
					if (!execute) {
						throw new Error(`Codemode tool "${name}" lost its execute function`);
					}

					return [
						name,
						{
							...aiTool,
							// Codemode's dispatcher calls execute with the validated args
							// only; the wrapped tool still expects AI SDK call options, so
							// synthesize them. The fresh id doubles as the nested call's
							// invocationId — for workspace_edit_item that id IS the
							// document-edit receipt id (same chain as direct calls).
							execute: async (args: unknown) => {
								const index = callIndex++;
								const invocationId = crypto.randomUUID();
								emit(index, name, "running");

								try {
									const output = await execute(args, {
										toolCallId: invocationId,
										messages: [],
										context: undefined,
										...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
									});
									const action = getDocumentEditAction(name, output, invocationId);
									const callSummary = getCallSummary(name, "completed", args, output);
									calls.push({
										toolName: name,
										status: "completed",
										...(callSummary ? { summary: callSummary } : {}),
										...(action ? { action } : {}),
									});
									emit(index, name, "completed");
									return output;
								} catch (error) {
									const callSummary = getCallSummary(name, "failed", args, undefined);
									calls.push({
										toolName: name,
										status: "failed",
										...(callSummary ? { summary: callSummary } : {}),
										error: truncate(errorMessage(error), MAX_ERROR_CHARS),
									});
									emit(index, name, "failed");
									throw error;
								}
							},
						},
					];
				}),
			);

			const runner = createCodeTool({
				tools: [{ name: CODEMODE_TOOL_NAMESPACE, tools: instrumented }],
				executor,
			});
			if (!runner.execute) {
				throw new Error("Code Mode returned a non-executable tool");
			}

			try {
				const output = await runner.execute(
					{ code },
					{ toolCallId: context.invocationId, messages: [], context: undefined },
				);
				if (Symbol.asyncIterator in output) {
					// The Tool type admits streaming outputs; createCodeTool never
					// produces one.
					throw new Error("Code Mode returned a streaming result");
				}
				const bounded = boundResult(output.result);

				return {
					status: "completed" as const,
					result: bounded.value,
					...(bounded.truncated ? { resultTruncated: true } : {}),
					calls,
					...boundLogs(output.logs),
				};
			} catch (error) {
				return {
					status: "error" as const,
					error: truncate(errorMessage(error), MAX_ERROR_CHARS),
					calls,
				};
			}
		},
	});
}

/** One-liner for a nested call, same phrasing as a direct chat row. */
function getCallSummary(
	toolName: string,
	status: "completed" | "failed",
	toolInput: unknown,
	output: unknown,
) {
	try {
		return truncate(
			getFinishedToolSummary({ baseStatus: status, output, toolInput, toolName }).summary,
			200,
		);
	} catch {
		return undefined;
	}
}

/** The model's view of a run: call records without app-only UI payloads. */
function getCodemodeModelOutput(output: AiCodemodeOutput): JSONValue {
	const calls = output.calls.map(({ action: _action, summary: _summary, ...call }) => call);
	// SAFETY: every field is JSON — `result` crossed the isolate's JSON-RPC
	// boundary and was bounded by boundResult; the rest is schema-validated
	// strings, booleans, and arrays of them.
	return { ...output, calls } as JSONValue;
}

function getDocumentEditAction(toolName: string, output: unknown, receiptId: string) {
	if (toolName !== "workspace_edit_item") {
		return undefined;
	}

	const record = asRecord(output);
	const lineChanges = asRecord(record.lineChanges);

	return record.itemType === "document" &&
		typeof record.itemId === "string" &&
		typeof record.path === "string" &&
		typeof record.applied === "number" &&
		record.applied > 0
		? {
				kind: "document-edit" as const,
				itemId: record.itemId,
				path: record.path,
				receiptId,
				...(typeof lineChanges.added === "number" && typeof lineChanges.removed === "number"
					? { lineChanges: { added: lineChanges.added, removed: lineChanges.removed } }
					: {}),
			}
		: undefined;
}

function boundResult(result: unknown): { value: unknown; truncated: boolean } {
	if (result === undefined) {
		return { value: null, truncated: false };
	}

	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(result);
	} catch {
		return { value: "(unserializable result)", truncated: true };
	}

	if (serialized === undefined) {
		return { value: null, truncated: false };
	}

	if (serialized.length <= MAX_RESULT_CHARS) {
		return { value: result, truncated: false };
	}

	return {
		value: `${serialized.slice(0, MAX_RESULT_CHARS)}… (truncated; return a smaller summary)`,
		truncated: true,
	};
}

function boundLogs(logs: string[] | undefined): { logs?: string[] } {
	if (!logs || logs.length === 0) {
		return {};
	}

	const bounded = logs.slice(0, MAX_LOG_ENTRIES).map((line) => truncate(line, MAX_LOG_CHARS));
	if (logs.length > MAX_LOG_ENTRIES) {
		bounded.push(`… ${logs.length - MAX_LOG_ENTRIES} more log lines dropped`);
	}

	return { logs: bounded };
}

function truncate(value: string, max: number) {
	return value.length <= max ? value : `${value.slice(0, max)}…`;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
