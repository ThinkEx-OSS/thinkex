import type { ToolExecutionOptions } from "ai";
import { asSchema } from "ai";
import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
	defineAIThreadTool,
	type AIThreadToolExecutionContext,
} from "#/features/workspaces/ai/ai-thread-tool";

const directOptions = {
	abortSignal: new AbortController().signal,
	context: {},
	messages: [],
	toolCallId: "direct-call",
} satisfies ToolExecutionOptions<unknown>;

describe("AI thread tool", () => {
	it("validates input, trims it, and threads the execution context", async () => {
		const contexts: AIThreadToolExecutionContext[] = [];
		const aiTool = defineAIThreadTool({
			inputSchema: z.object({ value: z.string().trim().min(1) }),
			outputSchema: z.object({ accepted: z.boolean() }),
			execute: async (input, context) => {
				contexts.push(context);
				return { accepted: input.value === "valid" };
			},
		});
		const execute = aiTool.execute;
		if (!execute) {
			throw new Error("Expected tool execution");
		}

		await expect(execute({ value: " valid " }, directOptions)).resolves.toEqual({
			accepted: true,
		});
		expect(contexts).toEqual([
			{ abortSignal: directOptions.abortSignal, invocationId: "direct-call" },
		]);
	});

	it("fails closed for malformed output", async () => {
		const invalidOutputTool = defineAIThreadTool({
			inputSchema: z.object({}),
			outputSchema: z.object({ accepted: z.boolean() }),
			execute: async () => ({ accepted: "yes" }) as never,
		});
		const execute = invalidOutputTool.execute;
		if (!execute) {
			throw new Error("Expected tool execution");
		}

		await expect(execute({}, directOptions)).rejects.toThrow();
	});

	it("preserves a compact model-output projection", async () => {
		const aiTool = defineAIThreadTool({
			inputSchema: z.object({}),
			outputSchema: z.object({ internalId: z.string(), value: z.string() }),
			execute: async () => ({ internalId: "private", value: "visible" }),
			toModelOutput: ({ output }) => ({
				type: "json",
				value: { value: output.value },
			}),
		});
		const toModelOutput = aiTool.toModelOutput;
		if (!toModelOutput) {
			throw new Error("Expected a model-output projection");
		}
		const output = await toModelOutput({
			input: {},
			output: { internalId: "private", value: "visible" },
			toolCallId: "call-1",
		});

		expect(output).toEqual({
			type: "json",
			value: { value: "visible" },
		});
	});

	it("omits unsupported provider array bounds without weakening runtime validation", async () => {
		const aiTool = defineAIThreadTool({
			inputSchema: z.object({ values: z.array(z.string()).max(1) }),
			outputSchema: z.object({ accepted: z.boolean() }),
			execute: async () => ({ accepted: true }),
		});
		const modelSchema = await asSchema(aiTool.inputSchema).jsonSchema;
		const execute = aiTool.execute;
		if (!execute) {
			throw new Error("Expected tool execution");
		}

		expect(JSON.stringify(modelSchema)).not.toContain('"maxItems"');
		await expect(execute({ values: ["one", "two"] }, directOptions)).rejects.toThrow();
	});
});
