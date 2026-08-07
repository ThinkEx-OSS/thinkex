const minuteMs = 60_000;

interface WorkspaceExtractionStepBudget {
	attempts: number;
	retryDelayMs: number;
	timeoutMs: number;
}

/**
 * Time budget for every step of an extraction, in one place.
 *
 * These are deliberately generous: parse time, upload time and projection writes all
 * scale with page count, and a budget sized for a typical document silently kills a
 * long one that is working correctly.
 *
 * They live together because the stall threshold below is their sum. Kept apart, that
 * relationship survives only as a comment, and a comment does not fail the build when
 * someone raises a timeout — which is how a healthy long document ends up classified
 * as abandoned and re-queued as a second billable workflow.
 */
export const workspaceExtractionStepBudgets = {
	/** Fast pass: parsing is quick, but it writes one R2 object per page. */
	liteParse: { attempts: 2, retryDelayMs: 15_000, timeoutMs: 8 * minuteMs },
	/**
	 * Upload, the provider's own poll ceiling, fetching the result, and writing the
	 * page projection. Single attempt: a retry cannot resume the job it lost, only
	 * start and pay for another.
	 */
	extract: { attempts: 1, retryDelayMs: 30_000, timeoutMs: 45 * minuteMs },
	/** Publishing the finished projection — a single kernel call. */
	publish: { attempts: 4, retryDelayMs: 10_000, timeoutMs: 2 * minuteMs },
} as const satisfies Record<string, WorkspaceExtractionStepBudget>;

function getWorstCaseMs(budget: WorkspaceExtractionStepBudget) {
	return budget.timeoutMs * budget.attempts + budget.retryDelayMs * (budget.attempts - 1);
}

/**
 * How long a projection may sit in `processing` before it is treated as stalled.
 *
 * The row is written once when extraction starts and not touched again until it
 * finishes, so this has to clear every step's budget back to back, with headroom.
 *
 * Both the read path and the reconciler use it, so setting it too low does not merely
 * mislabel a slow document — it queues a duplicate workflow, and a duplicate bill,
 * against one that is still parsing.
 */
export const workspaceExtractionStallThresholdMs =
	Math.ceil(
		(Object.values(workspaceExtractionStepBudgets).reduce(
			(total, budget) => total + getWorstCaseMs(budget),
			0,
		) *
			1.25) /
			minuteMs,
	) * minuteMs;

/** Shapes a budget into the retry and timeout options a workflow step expects. */
export function getWorkspaceExtractionStepConfig(budget: WorkspaceExtractionStepBudget) {
	return {
		retries: {
			backoff: "constant",
			delay: budget.retryDelayMs,
			limit: budget.attempts - 1,
		},
		timeout: budget.timeoutMs,
	} as const;
}
