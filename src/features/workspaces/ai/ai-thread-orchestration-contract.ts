import { z } from "zod";

import {
	aggregateAIToolOutcomes,
	aiToolOutcomeSchema,
	getInvalidAIToolOutcome,
	getAIToolOutputOutcome,
	type AIToolOutcome,
} from "#/features/workspaces/ai/ai-tool-outcome";

const orchestrationCallStateSchema = z.enum([
	"executing",
	"applied",
	"pending",
	"reverted",
	"error",
]);

const rawOrchestrationCallSchema = z.looseObject({
	seq: z.number().int().nonnegative(),
	connector: z.string().min(1),
	method: z.string().min(1),
	args: z.unknown(),
	result: z.unknown().optional(),
	requiresApproval: z.boolean(),
	ephemeral: z.boolean().optional(),
	state: orchestrationCallStateSchema,
});

const rawPendingActionSchema = z.looseObject({
	executionId: z.string().min(1),
	seq: z.number().int().nonnegative(),
	connector: z.string().min(1),
	method: z.string().min(1),
	args: z.unknown(),
});

const rawOrchestrationOutputSchema = z
	.discriminatedUnion("status", [
		z.looseObject({
			status: z.literal("completed"),
			executionId: z.string().min(1),
			result: z.unknown().optional(),
			logs: z.array(z.string()).optional(),
			calls: z.array(rawOrchestrationCallSchema).optional().default([]),
		}),
		z.looseObject({
			status: z.literal("paused"),
			executionId: z.string().min(1),
			pending: z.array(rawPendingActionSchema),
			calls: z.array(rawOrchestrationCallSchema).optional().default([]),
		}),
		z.looseObject({
			status: z.literal("error"),
			executionId: z.string().min(1),
			error: z.string(),
			logs: z.array(z.string()).optional(),
			calls: z.array(rawOrchestrationCallSchema).optional().default([]),
		}),
	])
	.superRefine((output, context) => {
		if (output.status !== "paused") {
			return;
		}

		for (const [index, pending] of output.pending.entries()) {
			if (pending.executionId !== output.executionId) {
				context.addIssue({
					code: "custom",
					message: "Pending action belongs to another Code Mode execution",
					path: ["pending", index, "executionId"],
				});
			}
		}
	});

const orchestrationCallSchema = z.object({
	id: z.string(),
	outcome: aiToolOutcomeSchema,
	requiresApproval: z.boolean(),
	state: orchestrationCallStateSchema,
	status: z.enum(["completed", "failed", "running"]),
	summary: z.string(),
	toolName: z.string(),
});

const orchestrationPendingActionSchema = z.object({
	connector: z.string(),
	method: z.string(),
	seq: z.number().int().nonnegative(),
});

export const aiThreadOrchestrationOutputSchema = z.discriminatedUnion("status", [
	z.object({
		status: z.literal("completed"),
		executionId: z.string(),
		result: z.unknown(),
		calls: z.array(orchestrationCallSchema),
		outcome: aiToolOutcomeSchema,
	}),
	z.object({
		status: z.literal("paused"),
		executionId: z.string(),
		pending: z.array(orchestrationPendingActionSchema),
		calls: z.array(orchestrationCallSchema),
		outcome: aiToolOutcomeSchema,
	}),
	z.object({
		status: z.literal("error"),
		executionId: z.string(),
		error: z.string(),
		calls: z.array(orchestrationCallSchema),
		outcome: aiToolOutcomeSchema,
	}),
]);

export type AIThreadOrchestrationOutput = z.output<typeof aiThreadOrchestrationOutputSchema>;

export function normalizeAIThreadOrchestrationOutput(output: unknown): AIThreadOrchestrationOutput {
	const parsed = rawOrchestrationOutputSchema.safeParse(output);
	if (!parsed.success) {
		return invalidOrchestrationOutput(output);
	}

	const calls = parsed.data.calls.map(normalizeCall);
	const childOutcome = aggregateAIToolOutcomes(calls.map((call) => call.outcome));

	if (parsed.data.status === "completed") {
		return {
			status: parsed.data.status,
			executionId: parsed.data.executionId,
			result: parsed.data.result,
			calls,
			outcome: childOutcome,
		};
	}

	if (parsed.data.status === "paused") {
		return {
			status: parsed.data.status,
			executionId: parsed.data.executionId,
			pending: parsed.data.pending.map(({ seq, connector, method }) => ({
				seq,
				connector,
				method,
			})),
			calls,
			outcome: aggregateAIToolOutcomes([
				childOutcome,
				{ failureCodes: ["approval_pending"], failedCount: 0, status: "partial" },
			]),
		};
	}

	const executionFailure = {
		failureCodes: ["codemode_execution_error"],
		failedCount: childOutcome.failedCount === 0 ? 1 : 0,
		status: "error",
	} satisfies AIToolOutcome;

	return {
		status: parsed.data.status,
		executionId: parsed.data.executionId,
		error: parsed.data.error,
		calls,
		outcome: aggregateAIToolOutcomes([childOutcome, executionFailure]),
	};
}

export function getAIThreadOrchestrationTelemetryOutput(output: unknown) {
	const parsed = aiThreadOrchestrationOutputSchema.safeParse(output);
	if (!parsed.success) {
		return {
			status: "invalid",
			outcome: getInvalidAIToolOutcome(),
		};
	}

	return {
		status: parsed.data.status,
		outcome: parsed.data.outcome,
		calls: parsed.data.calls,
		...(parsed.data.status === "paused" ? { pendingCount: parsed.data.pending.length } : {}),
	};
}

function invalidOrchestrationOutput(output: unknown): AIThreadOrchestrationOutput {
	return {
		status: "error",
		executionId: getExecutionId(output),
		error: "Code Mode returned an invalid execution result",
		calls: [],
		outcome: getInvalidAIToolOutcome(),
	};
}

function getExecutionId(output: unknown) {
	if (output === null || typeof output !== "object" || Array.isArray(output)) {
		return "";
	}

	return "executionId" in output && typeof output.executionId === "string"
		? output.executionId
		: "";
}

function normalizeCall(call: z.output<typeof rawOrchestrationCallSchema>) {
	const outcome = getOrchestrationCallOutcome(call.method, call.state, call.result);

	return {
		id: `${call.seq}:${call.connector}:${call.method}`,
		toolName: call.method,
		state: call.state,
		status: getOrchestrationCallStatus(call.state, outcome),
		requiresApproval: call.requiresApproval,
		outcome,
		summary: summarizeOrchestrationCall(outcome),
	};
}

function getOrchestrationCallStatus(
	state: z.output<typeof orchestrationCallStateSchema>,
	outcome: AIToolOutcome,
) {
	if (state === "pending") {
		return "running" as const;
	}

	return outcome.status === "error" ? ("failed" as const) : ("completed" as const);
}

function getOrchestrationCallOutcome(
	toolName: string,
	state: z.output<typeof orchestrationCallStateSchema>,
	result: unknown,
): AIToolOutcome {
	if (state === "applied") {
		return getAIToolOutputOutcome(toolName, result);
	}

	if (state === "pending") {
		return { failureCodes: ["approval_pending"], failedCount: 0, status: "partial" };
	}

	return {
		failureCodes: [state === "reverted" ? "codemode_tool_reverted" : "codemode_tool_error"],
		failedCount: 1,
		status: "error",
	};
}

function summarizeOrchestrationCall(outcome: AIToolOutcome) {
	if (outcome.status === "error") {
		return "Failed";
	}

	if (outcome.status === "partial") {
		return outcome.failureCodes.includes("approval_pending")
			? "Waiting for approval"
			: "Partially completed";
	}

	return "Completed";
}
