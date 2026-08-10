import { describe, expect, it } from "vitest";

import {
	canExportWorkspaceEstimate,
	workspaceExportMaxEstimatedBytes,
} from "#/features/workspaces/export/workspace-export-limit";

describe("workspace export limit", () => {
	it("allows the limit and blocks anything larger", () => {
		expect(canExportWorkspaceEstimate(workspaceExportMaxEstimatedBytes)).toBe(true);
		expect(canExportWorkspaceEstimate(workspaceExportMaxEstimatedBytes + 1)).toBe(false);
	});
});
