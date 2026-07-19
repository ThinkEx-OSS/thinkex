import type { ToolExecutionOptions } from "ai";
import { tool } from "ai";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
	defineAIThreadTool,
	requireAIThreadToolRuntime,
	type AIThreadToolExecutionContext,
} from "#/features/workspaces/ai/ai-thread-tool";

const directOptions = {
	abortSignal: new AbortController().signal,
	messages: [],
	toolCallId: "direct-call",
} satisfies ToolExecutionOptions;

describe("AI thread tool", () => {
	it("uses one validated execution path for direct and Code Mode calls", async () => {
		const contexts: AIThreadToolExecutionContext[] = [];
		const aiTool = defineAIThreadTool({
			inputSchema: z.object({ value: z.string().trim().min(1) }),
			outputSchema: z.object({ accepted: z.boolean() }),
			execute: async (input, context) => {
				contexts.push(context);
				return { accepted: input.value === "valid" };
			},
		});
		const executeDirect = aiTool.execute;
		if (!executeDirect) {
			throw new Error("Expected direct tool execution");
		}

		await expect(executeDirect({ value: " valid " }, directOptions)).resolves.toEqual({
			accepted: true,
		});
		await expect(
			requireAIThreadToolRuntime("test", aiTool).execute(
				{ value: "invalid" },
				{
					codemodeExecutionId: "execution-1",
					invocationId: "nested-call",
					source: "codemode",
				},
			),
		).resolves.toEqual({ accepted: false });
		expect(contexts).toEqual([
			{
				abortSignal: directOptions.abortSignal,
				invocationId: "direct-call",
				source: "direct",
			},
			{
				codemodeExecutionId: "execution-1",
				invocationId: "nested-call",
				source: "codemode",
			},
		]);
	});

	it("fails closed for malformed output and unowned tools", async () => {
		const invalidOutputTool = defineAIThreadTool({
			inputSchema: z.object({}),
			outputSchema: z.object({ accepted: z.boolean() }),
			execute: async () => ({ accepted: "yes" }) as never,
		});
		const execute = invalidOutputTool.execute;
		if (!execute) {
			throw new Error("Expected direct tool execution");
		}

		await expect(execute({}, directOptions)).rejects.toThrow();
		expect(() =>
			requireAIThreadToolRuntime(
				"foreign",
				tool({ inputSchema: z.object({}), execute: async () => ({ ok: true }) }),
			),
		).toThrow('Code Mode tool "foreign" must be defined with defineAIThreadTool');
	});
});
