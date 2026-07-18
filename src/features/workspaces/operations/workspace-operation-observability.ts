import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { recordOperationalOutcome } from "#/integrations/observability/operational-events";

export type WorkspaceOperationOutcome = "error" | "partial" | "success";

export interface WorkspaceOperationSummary {
	failureCodes: string[];
	failedCount: number;
	outcome: WorkspaceOperationOutcome;
	succeededCount: number;
}

interface WorkspaceOperationInput {
	context: WorkspaceAccessContext;
	mutating: boolean;
	operation: string;
}

export async function observeWorkspaceOperation<T>(
	input: WorkspaceOperationInput & {
		run: () => Promise<T>;
		summarize: (result: T) => WorkspaceOperationSummary;
	},
): Promise<T> {
	const startedAt = Date.now();

	try {
		const result = await input.run();
		const summary = input.summarize(result);
		recordWorkspaceOperation(input, summary, Date.now() - startedAt);
		return result;
	} catch (error) {
		recordOperationalOutcome({
			distinctId: input.context.actor.userId,
			error,
			event: "workspace_operation",
			fields: {
				duration_ms: Date.now() - startedAt,
				mutating: input.mutating,
				operation: input.operation,
				operation_id: input.context.operationId,
				user_id: input.context.actor.userId,
				workspace_id: input.context.workspaceId,
			},
		});
		throw error;
	}
}

export function summarizeWorkspaceCollectionResult(input: {
	failed: ReadonlyArray<{ code: string }>;
	items: readonly unknown[];
}) {
	return summarizeWorkspaceResult(input.items.length, input.failed);
}

export function summarizeWorkspaceReadResult(input: {
	results: ReadonlyArray<{ code?: string; status: "failed" | "pending" | "ready" }>;
}) {
	const failures: Array<{ code: string }> = [];
	let succeededCount = 0;
	for (const result of input.results) {
		if (result.status === "failed") {
			failures.push({ code: result.code ?? "unknown" });
		} else {
			succeededCount += 1;
		}
	}
	return summarizeWorkspaceResult(succeededCount, failures);
}

export function summarizeWorkspaceItemResult(input: {
	failed: ReadonlyArray<{ code: string }>;
	item?: unknown;
}) {
	return summarizeWorkspaceResult(input.item ? 1 : 0, input.failed);
}

export function summarizeWorkspaceAppliedResult(input: {
	applied: number;
	failed: ReadonlyArray<{ code: string }>;
}) {
	return summarizeWorkspaceResult(input.applied, input.failed);
}

function recordWorkspaceOperation(
	input: WorkspaceOperationInput,
	summary: WorkspaceOperationSummary,
	durationMs: number,
) {
	recordOperationalOutcome({
		distinctId: input.context.actor.userId,
		event: "workspace_operation",
		fields: {
			duration_ms: durationMs,
			failed_count: summary.failedCount,
			failure_codes: summary.failureCodes,
			mutating: input.mutating,
			operation: input.operation,
			operation_id: input.context.operationId,
			requested_count: summary.succeededCount + summary.failedCount,
			succeeded_count: summary.succeededCount,
			user_id: input.context.actor.userId,
			workspace_id: input.context.workspaceId,
		},
		outcome: summary.outcome,
	});
}

function summarizeWorkspaceResult(
	succeededCount: number,
	failures: ReadonlyArray<{ code: string }>,
): WorkspaceOperationSummary {
	return {
		failureCodes: Array.from(new Set(failures.map((failure) => failure.code))),
		failedCount: failures.length,
		outcome: failures.length === 0 ? "success" : succeededCount === 0 ? "error" : "partial",
		succeededCount,
	};
}
