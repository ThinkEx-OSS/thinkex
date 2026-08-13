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
	getAIThreadOrchestrationModelOutput,
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
			browser: {} as Cloudflare.Env["BROWSER"],
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

	it("keeps document edit controls app-only", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-edit",
			result: {
				nested: {
					__thinkexUi: { documentEditReceiptId: "receipt-secret" },
				},
			},
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "workspace_edit_item",
					state: "applied",
					requiresApproval: false,
					args: { path: "/Notes" },
					result: {
						applied: 1,
						failed: [],
						itemId: "document-1",
						itemType: "document",
						path: "/Notes",
						__thinkexUi: { documentEditReceiptId: "receipt-secret" },
					},
				},
			],
		});

		expect(output.calls[0]).toMatchObject({
			action: {
				itemId: "document-1",
				kind: "document-edit",
				path: "/Notes",
				receiptId: "receipt-secret",
			},
		});
		if (output.status !== "completed") {
			throw new Error("Expected completed orchestration output.");
		}
		expect(JSON.stringify(output.result)).not.toContain("__thinkexUi");

		const modelOutput = getAIThreadOrchestrationModelOutput(output);
		const telemetryOutput = getAIThreadOrchestrationTelemetryOutput(output);
		expect(JSON.stringify(modelOutput)).not.toContain("receipt-secret");
		expect(JSON.stringify(modelOutput)).not.toContain('"action"');
		expect(JSON.stringify(telemetryOutput)).not.toContain("receipt-secret");
	});

	it("does not turn flashcard edits into document review actions", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-flashcard-edit",
			result: null,
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "workspace_edit_item",
					state: "applied",
					requiresApproval: false,
					args: { path: "/Biology", type: "flashcard" },
					result: {
						applied: 1,
						failed: [],
						itemId: "flashcard-1",
						itemType: "flashcard",
						path: "/Biology",
						__thinkexUi: { documentEditReceiptId: "should-not-be-used" },
					},
				},
			],
		});

		expect(output.calls[0]).not.toHaveProperty("action");
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

	it("keeps pending calls partial and rejects cross-execution approvals", () => {
		const valid = normalizeAIThreadOrchestrationOutput({
			status: "paused",
			executionId: "execution-paused",
			pending: [
				{
					executionId: "execution-paused",
					seq: 2,
					connector: "tools",
					method: "workspace_edit_item",
					args: {},
				},
			],
			calls: [
				{
					seq: 2,
					connector: "tools",
					method: "workspace_edit_item",
					state: "pending",
					requiresApproval: true,
					args: {},
				},
			],
		});

		expect(valid).toMatchObject({
			status: "paused",
			outcome: {
				failureCodes: ["approval_pending"],
				failedCount: 0,
				status: "partial",
			},
			calls: [
				{
					state: "pending",
					status: "running",
					outcome: { status: "partial" },
				},
			],
		});

		const invalid = normalizeAIThreadOrchestrationOutput({
			status: "paused",
			executionId: "execution-paused",
			pending: [
				{
					executionId: "another-execution",
					seq: 2,
					connector: "tools",
					method: "workspace_edit_item",
					args: {},
				},
			],
			calls: [],
		});

		expect(invalid).toMatchObject({
			status: "error",
			executionId: "execution-paused",
			outcome: { failureCodes: ["invalid_orchestration_result"], status: "error" },
		});
	});

	it("reports an unfinished executing call as failed, not running", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "error",
			executionId: "execution-interrupted",
			error: "result could not be recorded",
			calls: [
				{
					seq: 1,
					connector: "tools",
					method: "workspace_read_items",
					state: "executing",
					requiresApproval: false,
					args: {},
				},
			],
		});

		expect(output).toMatchObject({
			status: "error",
			calls: [
				{
					state: "executing",
					status: "failed",
					outcome: {
						failureCodes: ["codemode_tool_error"],
						failedCount: 1,
						status: "error",
					},
				},
			],
			outcome: {
				failureCodes: ["codemode_tool_error", "codemode_execution_error"],
				failedCount: 1,
				status: "error",
			},
		});
	});

	it("keeps interleaved work in execution order instead of merging every browser stretch", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-interleaved",
			result: null,
			calls: [
				browserNavigation(1, "https://example.com/start"),
				{
					seq: 2,
					connector: "tools",
					method: "web_search",
					state: "applied",
					requiresApproval: false,
					args: { query: "notes" },
					result: { results: [] },
				},
				browserNavigation(3, "https://docs.example.org/guide"),
			],
		});

		expect(output.calls.map((call) => call.toolName)).toEqual([
			"browser_execute",
			"web_search",
			"browser_execute",
		]);
	});

	it("treats a reset-and-retry that recovered as a success, not a failure", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-recovered",
			result: null,
			calls: [
				{ ...browserNavigation(1, "https://example.com/"), state: "error" },
				{
					seq: 2,
					connector: "cdp",
					method: "resetSession",
					state: "applied",
					requiresApproval: false,
					args: {},
				},
				browserNavigation(3, "https://example.com/"),
			],
		});

		expect(output.calls).toMatchObject([{ status: "completed", state: "applied" }]);
		expect(output.outcome).toEqual({ failureCodes: [], failedCount: 0, status: "success" });
	});

	it("reports an in-flight browser retry as running rather than failed", () => {
		const output = normalizeAIThreadOrchestrationOutput({
			status: "completed",
			executionId: "execution-in-flight",
			result: null,
			calls: [
				{ ...browserNavigation(1, "https://example.com/"), state: "error" },
				{ ...browserNavigation(2, "https://example.com/"), state: "executing" },
			],
		});

		expect(output.calls).toMatchObject([{ status: "running", state: "executing" }]);
		expect(output.outcome.status).toBe("success");
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

function browserNavigation(seq: number, url: string) {
	return {
		seq,
		connector: "cdp",
		method: "send",
		state: "applied",
		requiresApproval: false,
		args: { method: "Page.navigate", params: { url } },
		result: {},
	};
}
