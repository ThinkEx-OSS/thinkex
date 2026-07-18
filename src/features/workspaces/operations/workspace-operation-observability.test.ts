import { describe, expect, it, vi } from "vitest";

vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalOutcome: vi.fn(),
}));

import { summarizeWorkspaceReadResult } from "#/features/workspaces/operations/workspace-operation-observability";

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
