import { beforeEach, describe, expect, it, vi } from "vitest";

const recordOperationalOutcome = vi.hoisted(() => vi.fn());

vi.mock("#/integrations/observability/operational-events", () => ({ recordOperationalOutcome }));

import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	observeWorkspaceOperation,
	summarizeWorkspaceReadResult,
} from "#/features/workspaces/operations/workspace-operation-observability";

describe("observeWorkspaceOperation", () => {
	const context = {
		actor: { userId: "user-1" },
		operationId: "operation-1",
		workspaceId: "workspace-1",
	} as WorkspaceAccessContext;

	beforeEach(() => {
		recordOperationalOutcome.mockReset();
	});

	function observeFailure(error: Error) {
		return observeWorkspaceOperation({
			context,
			mutating: false,
			operation: "workspace_read_items",
			run: () => Promise.reject(error),
			summarize: () => summarizeWorkspaceReadResult({ results: [] }),
		});
	}

	it("records a Durable Object storage reset as rejected instead of an exception", async () => {
		const error = Object.assign(new Error("storage caused object to be reset"), {
			durableObjectReset: true,
		});

		await expect(observeFailure(error)).rejects.toBe(error);
		const recorded = recordOperationalOutcome.mock.calls[0]?.[0];
		expect(recorded).toMatchObject({
			fields: { error_message: error.message, operation: "workspace_read_items" },
			outcome: "rejected",
		});
		expect(recorded).not.toHaveProperty("error");
	});

	it("records other failures as exceptions", async () => {
		const error = new Error("boom");

		await expect(observeFailure(error)).rejects.toBe(error);
		expect(recordOperationalOutcome).toHaveBeenCalledWith(expect.objectContaining({ error }));
	});
});

describe("summarizeWorkspaceReadResult", () => {
	it("tracks pending reads separately from successes and failures", () => {
		expect(
			summarizeWorkspaceReadResult({
				results: [
					{ status: "ready" },
					{ status: "pending" },
					{ code: "projection_failed", status: "failed" },
				],
			}),
		).toEqual({
			failedCount: 1,
			failureCodes: ["projection_failed"],
			outcome: "partial",
			pendingCount: 1,
			succeededCount: 1,
		});
	});

	it("records pending-only reads without inflating succeeded count", () => {
		expect(summarizeWorkspaceReadResult({ results: [{ status: "pending" }] })).toEqual({
			failedCount: 0,
			failureCodes: [],
			outcome: "success",
			pendingCount: 1,
			succeededCount: 0,
		});
	});
});
