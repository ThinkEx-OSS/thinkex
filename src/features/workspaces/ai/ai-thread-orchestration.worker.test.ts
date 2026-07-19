import type { ConnectorTools, ToolExecuteContext } from "@cloudflare/codemode";
import { createExecuteRuntime } from "@cloudflare/think/tools/execute";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

vi.mock("@cloudflare/codemode", () => ({
	CodemodeConnector: class {
		constructor(_ctx: DurableObjectState, _options: Record<string, never>) {}
	},
	sanitizeToolName: (name: string) => name.replaceAll("-", "_"),
}));

vi.mock("@cloudflare/codemode/ai", () => ({
	generateTypes: vi.fn(),
}));

vi.mock("@cloudflare/think/tools/execute", () => ({
	createExecuteRuntime: vi.fn(),
}));

vi.mock("#/features/workspaces/operations/workspace-tool-definitions", () => ({
	getWorkspaceToolDefinition: vi.fn(() => undefined),
	summarizeWorkspaceToolOutput: vi.fn(),
}));

import {
	createAIThreadOrchestrationTool,
	getAIThreadOrchestrationTelemetryOutput,
	normalizeAIThreadOrchestrationOutput,
} from "#/features/workspaces/ai/ai-thread-orchestration";
import {
	defineAIThreadTool,
	type AIThreadToolExecutionContext,
} from "#/features/workspaces/ai/ai-thread-tool";

describe("AI thread orchestration", () => {
	it("supplies honest nested context and rejects outputs that violate their schema", async () => {
		let receivedContext: AIThreadToolExecutionContext | undefined;
		vi.mocked(createExecuteRuntime).mockReturnValue({
			tool: {
				execute: vi.fn(),
			},
		} as never);

		createAIThreadOrchestrationTool({
			ctx: {} as DurableObjectState,
			description: "test",
			loader: {} as WorkerLoader,
			name: "orchestrate",
			tools: {
				nested: defineAIThreadTool({
					inputSchema: z.object({ value: z.string() }),
					outputSchema: z.object({ accepted: z.boolean() }),
					execute: async (_input, context) => {
						receivedContext = context;
						return { accepted: "not-a-boolean" } as never;
					},
				}),
			},
		});

		const runtimeOptions = vi.mocked(createExecuteRuntime).mock.calls.at(-1)?.[0] as
			| { connectors?: unknown[] }
			| undefined;
		const connector = runtimeOptions?.connectors?.[0] as unknown as {
			tools(): Promise<ConnectorTools>;
		};
		const nestedTools = await connector.tools();
		const execute = nestedTools.nested?.execute;
		if (!execute) {
			throw new Error("Expected nested test tool to be executable");
		}

		await expect(
			execute({ value: "test" }, { executionId: "execution-options" } as ToolExecuteContext),
		).rejects.toThrow();
		expect(receivedContext).toEqual({
			codemodeExecutionId: "execution-options",
			invocationId: expect.any(String),
			source: "codemode",
		});
	});

	it("normalizes raw nested calls without retaining arguments or results", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-1",
			result: { answer: "done" },
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "web_search",
					state: "applied",
					requiresApproval: false,
					args: { query: "private query" },
					result: { items: [{ url: "https://example.com" }] },
				},
			],
		});

		expect(output).toEqual({
			status: "completed",
			executionId: "execution-1",
			result: { answer: "done" },
			calls: [
				{
					id: "1:tools:web_search",
					toolName: "web_search",
					state: "applied",
					status: "completed",
					requiresApproval: false,
					outcome: { failureCodes: [], failedCount: 0, status: "success" },
					summary: "Completed",
				},
			],
			outcome: { failureCodes: [], failedCount: 0, status: "success" },
		});
		expect(JSON.stringify(output.calls)).not.toContain("private query");
		expect(JSON.stringify(output.calls)).not.toContain("example.com");
	});

	it("fails closed when a completed runtime result contains a malformed child call", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-invalid",
			result: { answer: "do not trust this" },
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "workspace_edit_item",
					state: "applied",
					args: {},
				},
			],
		});

		expect(output).toEqual({
			status: "error",
			executionId: "execution-invalid",
			error: "Code Mode returned an invalid execution result",
			calls: [],
			outcome: {
				failureCodes: ["invalid_orchestration_result"],
				failedCount: 1,
				status: "error",
			},
		});
	});

	it("turns a runtime-looking Code Mode failure into a semantic error outcome", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "error",
			executionId: "execution-2",
			error: "sandbox failed",
			calls: [],
		});

		expect(output.outcome).toEqual({
			failureCodes: ["codemode_execution_error"],
			failedCount: 1,
			status: "error",
		});
	});

	it("removes the final result from the telemetry projection", () => {
		const telemetry = getAIThreadOrchestrationTelemetryOutput({
			status: "completed",
			executionId: "execution-3",
			result: { secret: "not telemetry" },
			calls: [],
			outcome: { failureCodes: [], failedCount: 0, status: "success" },
		});

		expect(telemetry).toEqual({
			status: "completed",
			calls: [],
			outcome: { failureCodes: [], failedCount: 0, status: "success" },
		});
		expect(JSON.stringify(telemetry)).not.toContain("not telemetry");
	});
});
