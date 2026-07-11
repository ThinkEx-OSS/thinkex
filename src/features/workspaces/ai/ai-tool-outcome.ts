import type { ToolCallResultContext } from "@cloudflare/think";

import {
	getWorkspaceToolDefinition,
	summarizeWorkspaceToolOutput,
} from "#/features/workspaces/operations/workspace-tool-definitions";

export interface AIToolOutcome {
	failureCodes: string[];
	failedCount: number;
	status: "error" | "partial" | "success";
}

export function getAIToolOutcome(ctx: ToolCallResultContext): AIToolOutcome {
	if (!ctx.success) {
		return { failureCodes: [], failedCount: 1, status: "error" };
	}

	const workspaceTool = getWorkspaceToolDefinition(ctx.toolName);
	if (workspaceTool) {
		const summary = summarizeWorkspaceToolOutput(ctx.toolName, ctx.output);
		if (!summary) {
			return { failureCodes: ["invalid_tool_result"], failedCount: 1, status: "error" };
		}
		return {
			failureCodes: summary.failureCodes,
			failedCount: summary.failedCount,
			status: summary.outcome,
		};
	}

	if (ctx.toolName === "compute" && hasComputeError(ctx.output)) {
		return { failureCodes: ["compute_error"], failedCount: 1, status: "error" };
	}

	return { failureCodes: [], failedCount: 0, status: "success" };
}

function hasComputeError(output: unknown) {
	if (output === null || typeof output !== "object" || Array.isArray(output)) {
		return false;
	}

	return "error" in output && output.error !== undefined;
}
