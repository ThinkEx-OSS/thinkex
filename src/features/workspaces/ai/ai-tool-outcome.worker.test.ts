import { describe, expect, it, vi } from "vitest";

vi.mock("#/features/workspaces/operations/workspace-tool-definitions", () => ({
	getWorkspaceToolDefinition: vi.fn(() => undefined),
	summarizeWorkspaceToolOutput: vi.fn(),
}));

import {
	aggregateAIToolOutcomes,
	getAIToolOutcome,
} from "#/features/workspaces/ai/ai-tool-outcome";

describe("AI tool outcomes", () => {
	it("uses the embedded orchestration outcome instead of runtime success", () => {
		expect(
			getAIToolOutcome({
				output: {
					status: "completed",
					outcome: {
						failureCodes: ["workspace_write_failed"],
						failedCount: 1,
						status: "error",
					},
				},
				success: true,
				toolName: "orchestrate",
			} as Parameters<typeof getAIToolOutcome>[0]),
		).toEqual({
			failureCodes: ["workspace_write_failed"],
			failedCount: 1,
			status: "error",
		});
	});

	it("fails closed for an invalid orchestration result", () => {
		expect(
			getAIToolOutcome({
				output: { status: "completed" },
				success: true,
				toolName: "orchestrate",
			} as Parameters<typeof getAIToolOutcome>[0]),
		).toEqual({
			failureCodes: ["invalid_orchestration_result"],
			failedCount: 1,
			status: "error",
		});
	});

	it("aggregates counts while deduplicating failure codes", () => {
		expect(
			aggregateAIToolOutcomes([
				{ failureCodes: ["write_failed"], failedCount: 1, status: "error" },
				{
					failureCodes: ["write_failed", "read_failed"],
					failedCount: 2,
					status: "partial",
				},
			]),
		).toEqual({
			failureCodes: ["write_failed", "read_failed"],
			failedCount: 3,
			status: "error",
		});
	});
});
