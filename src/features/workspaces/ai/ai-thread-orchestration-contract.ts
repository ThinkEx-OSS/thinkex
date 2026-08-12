import { z } from "zod";

import {
	aggregateAIToolOutcomes,
	aiToolOutcomeSchema,
	getInvalidAIToolOutcome,
	getAIToolOutputOutcome,
	type AIToolOutcome,
} from "#/features/workspaces/ai/ai-tool-outcome";
import { summarizeAIThreadBrowserActivity } from "#/features/workspaces/ai/ai-thread-browser-activity";
import {
	getDocumentEditReceiptMetadata,
	stripAIThreadToolUiMetadata,
} from "#/features/workspaces/ai/ai-thread-tool-ui-metadata";
import { asRecord } from "#/lib/record";

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
	action: z
		.object({
			kind: z.literal("document-edit"),
			itemId: z.string(),
			lineChanges: z.object({ added: z.number(), removed: z.number() }).optional(),
			path: z.string(),
			receiptId: z.string(),
		})
		.optional(),
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

	const calls = normalizeCalls(parsed.data.calls);
	const childOutcome = aggregateAIToolOutcomes(calls.map((call) => call.outcome));

	if (parsed.data.status === "completed") {
		return {
			status: parsed.data.status,
			executionId: parsed.data.executionId,
			result: stripAIThreadToolUiMetadata(parsed.data.result),
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
		calls: withoutCallActions(parsed.data.calls),
		...(parsed.data.status === "paused" ? { pendingCount: parsed.data.pending.length } : {}),
	};
}

export function getAIThreadOrchestrationModelOutput(output: unknown) {
	const parsed = aiThreadOrchestrationOutputSchema.safeParse(output);
	if (!parsed.success) {
		return output;
	}

	return { ...parsed.data, calls: withoutCallActions(parsed.data.calls) };
}

/** `action` drives the app's review controls; neither the model nor telemetry sees it. */
function withoutCallActions(calls: z.output<typeof orchestrationCallSchema>[]) {
	return calls.map(({ action: _action, ...call }) => call);
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
	const action = getDocumentEditAction(call);

	return {
		...(action ? { action } : {}),
		id: `${call.seq}:${call.connector}:${call.method}`,
		toolName: call.method,
		state: call.state,
		status: getOrchestrationCallStatus(call.state, outcome),
		requiresApproval: call.requiresApproval,
		outcome,
		summary: summarizeOrchestrationCall(outcome),
	};
}

function getDocumentEditAction(call: z.output<typeof rawOrchestrationCallSchema>) {
	if (call.method !== "workspace_edit_item" || call.state !== "applied") {
		return undefined;
	}

	const args = asRecord(call.args);
	const result = asRecord(call.result);
	const path =
		typeof result.path === "string"
			? result.path
			: typeof args.path === "string"
				? args.path
				: undefined;
	const applied = typeof result.applied === "number" ? result.applied : 0;
	const itemId = typeof result.itemId === "string" ? result.itemId : undefined;
	const receiptId = getDocumentEditReceiptMetadata(call.result);

	const lineChanges = asRecord(result.lineChanges);
	return itemId && path && applied > 0 && receiptId
		? {
				itemId,
				kind: "document-edit" as const,
				...(typeof lineChanges.added === "number" && typeof lineChanges.removed === "number"
					? { lineChanges: { added: lineChanges.added, removed: lineChanges.removed } }
					: {}),
				path,
				receiptId,
			}
		: undefined;
}

/**
 * Collapse each *contiguous* run of CDP traffic into one browser receipt.
 *
 * Grouping every CDP call in the execution instead would reorder the
 * transcript: a tool call made between two browser stretches would render
 * after browsing that actually happened later, and two unrelated visits would
 * merge into a single row.
 */
function normalizeCalls(rawCalls: z.output<typeof rawOrchestrationCallSchema>[]) {
	const calls: ReturnType<typeof normalizeCall>[] = [];
	let browserRun: z.output<typeof rawOrchestrationCallSchema>[] = [];

	const flushBrowserRun = () => {
		if (browserRun.length === 0) {
			return;
		}

		const browserCall = normalizeBrowserCalls(browserRun);
		if (browserCall) {
			calls.push(browserCall);
		}
		browserRun = [];
	};

	for (const call of rawCalls) {
		if (call.connector === "cdp") {
			browserRun.push(call);
			continue;
		}

		flushBrowserRun();
		calls.push(normalizeCall(call));
	}
	flushBrowserRun();

	return calls;
}

function normalizeBrowserCalls(calls: z.output<typeof rawOrchestrationCallSchema>[]) {
	const state = getBrowserCallState(calls);
	// One row, one verdict: the outcome follows the same "where did the run end
	// up" rule as the state. Aggregating every call instead would report
	// `codemode_tool_error` for a reset-and-retry that already recovered, and
	// would count an in-flight call — which has no result yet, and which
	// getOrchestrationCallOutcome reads as a failure — as a failure.
	const decidingCall = state === "executing" ? undefined : calls.at(-1);
	const outcome: AIToolOutcome = decidingCall
		? getOrchestrationCallOutcome("browser_execute", decidingCall.state, decidingCall.result)
		: { failureCodes: [], failedCount: 0, status: "success" };
	const status =
		state === "executing" ? ("running" as const) : getOrchestrationCallStatus(state, outcome);
	const summary = summarizeAIThreadBrowserActivity(calls, status);
	if (!summary) {
		return undefined;
	}

	return {
		id: `${calls[0]?.seq ?? 0}:cdp:browser_execute`,
		toolName: "browser_execute",
		state,
		status,
		requiresApproval: false,
		outcome,
		summary,
	};
}

/**
 * The browser guidance tells the model to call `cdp.resetSession()` once and
 * retry when a reused session has gone away, so a failed call followed by a
 * successful one is the *supported* recovery path, not a failure. The durable
 * log keeps the original error forever, so the group has to be judged by where
 * the run ended up: anything still in flight reads as running, and an error
 * counts only when nothing after it succeeded.
 */
function getBrowserCallState(
	calls: z.output<typeof rawOrchestrationCallSchema>[],
): z.output<typeof orchestrationCallStateSchema> {
	if (calls.some((call) => call.state === "executing" || call.state === "pending")) {
		return "executing";
	}

	const lastSettled = calls.at(-1);
	return lastSettled?.state === "error" || lastSettled?.state === "reverted" ? "error" : "applied";
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
