import { beforeEach, describe, expect, it, vi } from "vitest";

import { fitTelemetryContent } from "#/features/workspaces/ai/chat/chat-model";
import { createAiChatTurnTelemetry } from "#/features/workspaces/ai/chat/chat-telemetry";

const mocks = vi.hoisted(() => ({
	captureGeneration: vi.fn(),
	captureEvent: vi.fn(),
}));

vi.mock("#/integrations/posthog/ai-observability", () => ({
	capturePostHogAiGeneration: mocks.captureGeneration,
}));

vi.mock("#/integrations/posthog/server", () => ({
	capturePostHogServerEvent: mocks.captureEvent,
}));

beforeEach(() => {
	mocks.captureGeneration.mockReset();
	mocks.captureEvent.mockReset();
	vi.useRealTimers();
});

describe("fitTelemetryContent", () => {
	it("passes an under-budget transcript through untouched", () => {
		const entries = [
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "hello" },
		];

		expect(fitTelemetryContent(entries)).toEqual(entries);
	});

	it("drops oldest messages first and marks the omission", () => {
		const big = "x".repeat(250_000);
		const entries = [
			{ role: "user", content: big },
			{ role: "assistant", content: big },
			{ role: "user", content: big },
			{ role: "assistant", content: "the newest reply" },
		];

		const fitted = fitTelemetryContent(entries);

		expect(fitted[0]).toEqual({
			role: "system",
			content: "(2 earlier messages omitted from telemetry)",
		});
		expect(fitted.at(-1)).toEqual(entries.at(-1));
		expect(fitted).toHaveLength(3);
	});

	it("slices a lone over-budget entry, the compaction-prompt case", () => {
		const fitted = fitTelemetryContent([{ role: "user", content: "y".repeat(500_000) }]);
		const only = fitted[0] as { content: string };

		expect(fitted).toHaveLength(1);
		expect(only.content.endsWith("…(truncated)")).toBe(true);
		expect(only.content.length).toBeLessThan(410_000);
	});
});

describe("createAiChatTurnTelemetry", () => {
	function createObserver(
		summarizeToolOutput: Parameters<
			typeof createAiChatTurnTelemetry
		>[0]["summarizeToolOutput"] = () => null,
	) {
		return createAiChatTurnTelemetry({
			userId: "user-1",
			workspaceId: "workspace-1",
			threadId: "thread-1",
			traceId: "stream-1",
			modelId: "auto",
			gatewayModel: "openai/gpt-requested",
			continuation: false,
			includeContent: true,
			modelInput: [{ role: "user", content: "hello" }],
			schedule: () => {},
			summarizeToolOutput,
		});
	}

	it("separates model steps, tool runtime, and visible-response timing", () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const observer = createObserver();

		vi.setSystemTime(1_020);
		observer.onChunk({ type: "reasoning-delta", text: "hidden" });
		observer.onStepEnd({
			callId: "step-0",
			stepNumber: 0,
			text: "",
			finishReason: "tool-calls",
			usage: {
				inputTokens: 10,
				inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
				outputTokens: 2,
				outputTokenDetails: { textTokens: 2, reasoningTokens: 0 },
				totalTokens: 12,
			},
			providerMetadata: { gateway: { routing: {} } },
			response: { modelId: "requested-model-id" },
			performance: {
				responseTimeMs: 20,
				stepTimeMs: 25,
			},
			toolCalls: [{ toolName: "workspace_search" }],
		});
		observer.onToolExecutionEnd({
			callId: "step-0",
			toolCall: { toolCallId: "tool-call-1", toolName: "workspace_search" },
			toolExecutionMs: 5,
			toolOutput: { type: "tool-result", output: {} },
		});

		vi.setSystemTime(1_030);
		observer.onChunk({ type: "text-delta", text: "Final" });
		observer.onStepEnd({
			callId: "step-1",
			stepNumber: 1,
			text: "Final answer",
			finishReason: "stop",
			usage: {
				inputTokens: 12,
				inputTokenDetails: { noCacheTokens: 12, cacheReadTokens: 0, cacheWriteTokens: 0 },
				outputTokens: 3,
				outputTokenDetails: { textTokens: 3, reasoningTokens: 0 },
				totalTokens: 15,
			},
			response: { modelId: "requested-model-id" },
			performance: {
				responseTimeMs: 10,
				stepTimeMs: 10,
				timeToFirstOutputMs: 4,
			},
			toolCalls: [],
		});

		vi.setSystemTime(1_100);
		observer.finish("complete");

		expect(mocks.captureGeneration).toHaveBeenCalledTimes(2);
		expect(mocks.captureGeneration.mock.calls[0]?.[0]).toMatchObject({
			spanName: "chat-step",
			spanId: "step-0",
			input: null,
			output: null,
			latency: 0.02,
			properties: {
				has_visible_text: false,
				is_final_step: false,
				turn_status: "complete",
				tool_names: ["workspace_search"],
			},
		});
		expect(mocks.captureGeneration.mock.calls[1]?.[0]).toMatchObject({
			spanId: "step-1",
			input: [{ role: "user", content: "hello" }],
			output: [{ role: "assistant", content: "Final answer" }],
			latency: 0.01,
			timeToFirstToken: 0.004,
			properties: {
				has_visible_text: true,
				is_final_step: true,
				turn_status: "complete",
			},
		});
		expect(mocks.captureEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "ai_tool_invoked",
				properties: expect.objectContaining({
					tool_name: "workspace_search",
					runtime_success: true,
				}),
			}),
		);
		expect(mocks.captureEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "ai_turn_completed",
				properties: expect.objectContaining({
					status: "complete",
					step_count: 2,
					duration_ms: 100,
					time_to_first_visible_text_ms: 30,
				}),
			}),
		);
	});

	it("records a resolved workspace failure as a semantic failure", () => {
		const summarizeToolOutput = vi.fn(() => ({
			failureCodes: ["path_already_exists"],
			failedCount: 1,
			outcome: "error" as const,
		}));
		const observer = createObserver(summarizeToolOutput);
		const output = {
			items: [],
			failed: [{ code: "path_already_exists", path: "/Existing", index: 0 }],
		};

		observer.onToolExecutionEnd({
			callId: "step-0",
			toolCall: { toolCallId: "tool-call-1", toolName: "workspace_create_items" },
			toolExecutionMs: 5,
			toolOutput: {
				type: "tool-result",
				output,
			},
		});
		expect(summarizeToolOutput).toHaveBeenCalledWith("workspace_create_items", output);

		expect(mocks.captureEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "ai_tool_invoked",
				properties: expect.objectContaining({
					success: false,
					runtime_success: true,
					outcome: "error",
					failure_count: 1,
					failure_codes: ["path_already_exists"],
				}),
			}),
		);
	});

	it.each(["interrupted", "error"] as const)(
		"records a %s turn even when no model step completes",
		(status) => {
			const observer = createObserver();
			observer.finish(status, status === "error" ? "safe error" : undefined);

			expect(mocks.captureGeneration).not.toHaveBeenCalled();
			expect(mocks.captureEvent).toHaveBeenCalledWith(
				expect.objectContaining({
					event: "ai_turn_completed",
					properties: expect.objectContaining({ status, step_count: 0 }),
				}),
			);
			expect(
				mocks.captureEvent.mock.calls.some(([event]) => event.event === "ai_turn_failed"),
			).toBe(status === "error");
		},
	);
});
