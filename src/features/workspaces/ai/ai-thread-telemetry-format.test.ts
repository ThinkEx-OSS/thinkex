import { describe, expect, it } from "vitest";

import {
	buildAiTelemetryOutputFromStep,
	buildAiTelemetryToolDefinitions,
	buildTccTokenUsage,
	extractAiTelemetryTokenUsage,
	getAiTelemetryToolCallNames,
	getAiTelemetryErrorPayload,
	sanitizeAiTelemetryValue,
	summarizeAiTelemetryMessages,
} from "#/features/workspaces/ai/ai-thread-telemetry-format";

describe("AI telemetry formatting", () => {
	it("formats available tools for observability payloads", () => {
		expect(
			buildAiTelemetryToolDefinitions({
				compute: {
					description: "Execute private Python code.",
				},
			}),
		).toEqual([
			{
				type: "function",
				function: {
					name: "compute",
					description: "Execute private Python code.",
				},
			},
		]);
	});

	it("preserves assistant text and tool calls in generation output", () => {
		expect(
			buildAiTelemetryOutputFromStep({
				text: "I'll check.",
				toolCalls: [
					{
						toolCallId: "call-1",
						toolName: "workspace_list_items",
						input: { path: "/" },
					},
				],
			} as never),
		).toEqual([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "I'll check." },
					{
						type: "tool-call",
						id: "call-1",
						function: {
							name: "workspace_list_items",
							arguments: '{"path":"/"}',
						},
					},
				],
			},
		]);
	});

	it("extracts tool names and normalized token usage", () => {
		expect(
			getAiTelemetryToolCallNames([{ toolName: "compute" }, { name: "web_search" }, { input: {} }]),
		).toEqual(["compute", "web_search"]);

		const usage = extractAiTelemetryTokenUsage({
			inputTokens: 100,
			cachedInputTokens: 40,
			outputTokens: 25,
			reasoningTokens: 7,
		});

		expect(usage).toEqual({
			cacheReadInputTokens: 40,
			inputTokens: 100,
			outputTokens: 25,
			reasoningTokens: 7,
		});
		expect(buildTccTokenUsage(usage)).toEqual({
			uncached: 60,
			cached: 40,
			completion: 25,
		});
	});

	it("bounds telemetry before mapping and preserves repeated non-circular values", () => {
		const shared = { value: "shared" };
		const circular: { self?: unknown } = {};
		circular.self = circular;
		const messages = Array.from({ length: 100 }, (_, index) => ({
			content: Array.from({ length: 100 }, () => ({ text: "part", type: "text" })),
			role: "user",
			index,
		}));

		const summarized = summarizeAiTelemetryMessages(messages) as Array<{
			content: unknown[];
		}>;
		expect(summarized).toHaveLength(80);
		expect(summarized[0]?.content).toHaveLength(80);
		expect(sanitizeAiTelemetryValue({ first: shared, second: shared, circular })).toEqual({
			first: shared,
			second: shared,
			circular: { self: "[circular]" },
		});
	});

	it("bounds nested error strings", () => {
		const payload = getAiTelemetryErrorPayload(new Error("x".repeat(7000))) as {
			message: string;
		};

		expect(payload.message).toHaveLength(6003);
		expect(payload.message.endsWith("...")).toBe(true);
	});
});
