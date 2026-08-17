import { env } from "cloudflare:test";
import type { ToolExecutionOptions } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import type { AiCodemodeActivityEvent } from "#/features/workspaces/ai/codemode-tool";
import { createAiChatCodemodeTool } from "#/features/workspaces/ai/codemode-tool";
import { createAiChatTools } from "#/features/workspaces/ai/chat/chat-tools";

const directOptions = (toolCallId: string): ToolExecutionOptions<unknown> => ({
	toolCallId,
	messages: [],
	context: undefined,
});

// Named to survive sanitizeToolName untouched — a name that is a JS reserved
// word (e.g. "double") gets a trailing underscore in the sandbox namespace.
function createDoubleNumberTool() {
	return defineAIThreadTool({
		description: "Double a number",
		inputSchema: z.object({ value: z.number().describe("the number to double") }),
		outputSchema: z.object({ doubled: z.number() }),
		execute: ({ value }) => ({ doubled: value * 2 }),
	});
}

describe("orchestrate tool description", () => {
	it("renders concrete types from the original schemas and omits excluded tools", () => {
		const tools = createAiChatTools({
			env,
			threadContext: {
				id: "thread-test",
				workspaceId: "workspace-test",
				promptScope: { canMutate: true, workspaceName: "Test" },
				userId: "user-test",
			},
			canMutate: true,
		});
		const orchestrate = tools.orchestrate;
		if (!orchestrate || typeof orchestrate.description !== "string") {
			throw new Error("Expected an orchestrate tool with a description");
		}

		// The lazy provider schemas render as `unknown` in Code Mode's sync
		// generator; the runtime-schema swap must prevent that wholesale loss.
		expect(orchestrate.description).not.toMatch(/type \w+Input = unknown/);
		expect(orchestrate.description).not.toMatch(/type \w+Output = unknown/);
		expect(orchestrate.description).toContain("workspace_read_items");
		expect(orchestrate.description).toContain("web_search");
		expect(orchestrate.description).not.toContain("workspace_delete_items");
		expect(orchestrate.description).not.toContain("activate_skill");
	});

	it("keeps write tools out of a view-only turn's orchestrate tool", () => {
		const tools = createAiChatTools({
			env,
			threadContext: {
				id: "thread-test",
				workspaceId: "workspace-test",
				promptScope: { canMutate: false, workspaceName: "Test" },
				userId: "user-test",
			},
			canMutate: false,
		});
		const orchestrate = tools.orchestrate;
		if (!orchestrate || typeof orchestrate.description !== "string") {
			throw new Error("Expected an orchestrate tool with a description");
		}

		expect(orchestrate.description).not.toContain("workspace_edit_item");
		expect(orchestrate.description).toContain("workspace_read_items");
	});
});

describe("orchestrate tool execution", () => {
	it("runs generated code against nested tools and records the calls", async () => {
		const events: AiCodemodeActivityEvent[] = [];
		const orchestrate = createAiChatCodemodeTool({
			env,
			tools: { double_number: createDoubleNumberTool() },
			onActivity: (event) => events.push(event),
		});
		if (!orchestrate.execute) {
			throw new Error("Expected an executable orchestrate tool");
		}

		const output = await orchestrate.execute(
			{
				title: "Doubling a number",
				code: "async () => { const r = await tools.double_number({ value: 21 }); return r.doubled; }",
			},
			directOptions("codemode-run"),
		);

		expect(output).toMatchObject({
			status: "completed",
			result: 42,
			calls: [{ toolName: "double_number", status: "completed", summary: "Ran double number" }],
		});
		expect(events).toEqual([
			{
				invocationId: "codemode-run",
				title: "Doubling a number",
				call: { index: 0, toolName: "double_number", status: "running" },
			},
			{
				invocationId: "codemode-run",
				title: "Doubling a number",
				call: { index: 0, toolName: "double_number", status: "completed" },
			},
		]);
	});

	it("reports code failures as an error output instead of throwing", async () => {
		const orchestrate = createAiChatCodemodeTool({
			env,
			tools: { double_number: createDoubleNumberTool() },
		});
		if (!orchestrate.execute) {
			throw new Error("Expected an executable orchestrate tool");
		}

		const output = await orchestrate.execute(
			{ title: "Failing on purpose", code: "async () => { throw new Error('boom'); }" },
			directOptions("codemode-error"),
		);

		expect(output).toMatchObject({ status: "error", calls: [] });
		if (output.status !== "error") {
			throw new Error("Expected an error output");
		}
		expect(output.error).toContain("boom");
	});

	it("caps nested calls at the limit with one overflow marker", async () => {
		const orchestrate = createAiChatCodemodeTool({
			env,
			tools: { double_number: createDoubleNumberTool() },
		});
		if (!orchestrate.execute) {
			throw new Error("Expected an executable orchestrate tool");
		}

		const output = await orchestrate.execute(
			{
				title: "Looping past the limit",
				code: "async () => { for (let i = 0; i < 120; i += 1) { try { await tools.double_number({ value: i }); } catch (error) { return { stoppedAt: i, message: error.message }; } } return 'no limit hit'; }",
			},
			directOptions("codemode-cap"),
		);

		if (output.status !== "completed") {
			throw new Error("Expected the run to complete via the caught limit error");
		}
		expect(output.result).toMatchObject({ stoppedAt: 100 });
		// 100 real calls plus exactly one overflow marker, however many rejections.
		expect(output.calls).toHaveLength(101);
		expect(output.calls.at(-1)).toMatchObject({ status: "failed" });
	});

	it("records a failed nested call when the tool itself throws", async () => {
		const failing = defineAIThreadTool({
			description: "Always fails",
			inputSchema: z.object({}),
			outputSchema: z.object({ ok: z.boolean() }),
			execute: () => {
				throw new Error("tool exploded");
			},
		});
		const orchestrate = createAiChatCodemodeTool({ env, tools: { failing } });
		if (!orchestrate.execute) {
			throw new Error("Expected an executable orchestrate tool");
		}

		const output = await orchestrate.execute(
			{ title: "Calling a broken tool", code: "async () => { return await tools.failing({}); }" },
			directOptions("codemode-tool-error"),
		);

		expect(output).toMatchObject({
			status: "error",
			calls: [{ toolName: "failing", status: "failed" }],
		});
	});
});
