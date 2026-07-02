import { describe, expect, it } from "vitest";

import {
	buildAiTelemetryOutputFromStep,
	buildAiTelemetryToolDefinitions,
	buildTccTokenUsage,
	extractAiTelemetryTokenUsage,
	getAiTelemetryToolCallNames,
} from "#/features/workspaces/ai/ai-thread-telemetry-format";

describe("AI telemetry formatting", () => {
	it("formats available tools in the function-tool shape used by observability vendors", () => {
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

	it("adds PostHog-compatible tool calls to generation output choices", () => {
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

	it("extracts tool names for PostHog's tools aggregation properties", () => {
		expect(
			getAiTelemetryToolCallNames([{ toolName: "compute" }, { name: "web_search" }, { input: {} }]),
		).toEqual(["compute", "web_search"]);
	});

	it("normalizes richer usage for PostHog and TCC", () => {
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
});
