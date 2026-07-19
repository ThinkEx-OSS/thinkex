import type { ToolCallResultContext } from "@cloudflare/think";
import { z } from "zod";

import {
	getWorkspaceToolDefinition,
	summarizeWorkspaceToolOutput,
} from "#/features/workspaces/operations/workspace-tool-definitions";

export const aiToolOutcomeSchema = z.object({
	failureCodes: z.array(z.string()),
	failedCount: z.number().int().nonnegative(),
	status: z.enum(["error", "partial", "success"]),
});

export type AIToolOutcome = z.output<typeof aiToolOutcomeSchema>;

export function getAIToolOutcome(ctx: ToolCallResultContext): AIToolOutcome {
	if (!ctx.success) {
		return { failureCodes: [], failedCount: 1, status: "error" };
	}

	if (ctx.toolName === "orchestrate") {
		return getEmbeddedAIToolOutcome(ctx.output) ?? getInvalidAIToolOutcome();
	}

	return getAIToolOutputOutcome(ctx.toolName, ctx.output);
}

export function getInvalidAIToolOutcome(): AIToolOutcome {
	return {
		failureCodes: ["invalid_orchestration_result"],
		failedCount: 1,
		status: "error",
	};
}

export function getAIToolOutputOutcome(toolName: string, output: unknown): AIToolOutcome {
	const workspaceTool = getWorkspaceToolDefinition(toolName);
	if (workspaceTool) {
		const summary = summarizeWorkspaceToolOutput(toolName, output);
		if (!summary) {
			return { failureCodes: ["invalid_tool_result"], failedCount: 1, status: "error" };
		}
		return {
			failureCodes: summary.failureCodes,
			failedCount: summary.failedCount,
			status: summary.outcome,
		};
	}

	if (toolName === "compute" && hasComputeError(output)) {
		return { failureCodes: ["compute_error"], failedCount: 1, status: "error" };
	}

	return { failureCodes: [], failedCount: 0, status: "success" };
}

export function aggregateAIToolOutcomes(outcomes: readonly AIToolOutcome[]): AIToolOutcome {
	const failureCodes = Array.from(new Set(outcomes.flatMap((outcome) => outcome.failureCodes)));
	const failedCount = outcomes.reduce((total, outcome) => total + outcome.failedCount, 0);
	const status = outcomes.some((outcome) => outcome.status === "error")
		? "error"
		: outcomes.some((outcome) => outcome.status === "partial")
			? "partial"
			: "success";

	return { failureCodes, failedCount, status };
}

function getEmbeddedAIToolOutcome(output: unknown): AIToolOutcome | null {
	if (output === null || typeof output !== "object" || Array.isArray(output)) {
		return null;
	}

	const outcome = "outcome" in output ? output.outcome : undefined;
	const parsed = aiToolOutcomeSchema.safeParse(outcome);
	return parsed.success ? parsed.data : null;
}

function hasComputeError(output: unknown) {
	if (output === null || typeof output !== "object" || Array.isArray(output)) {
		return false;
	}

	return "error" in output && output.error !== undefined;
}
