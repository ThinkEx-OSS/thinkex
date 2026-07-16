import { describe, expect, it } from "vitest";

import {
	isWorkspaceKernelNameConflictError,
	WorkspaceKernelNameConflictError,
} from "#/features/workspaces/kernel/workspace-kernel-errors";

describe("isWorkspaceKernelNameConflictError", () => {
	it("recognizes local name conflict errors", () => {
		expect(isWorkspaceKernelNameConflictError(new WorkspaceKernelNameConflictError())).toBe(true);
	});

	it("recognizes name conflict errors serialized across Durable Object RPC", () => {
		expect(
			isWorkspaceKernelNameConflictError({
				toString: () => "WorkspaceKernelNameConflictError: Workspace item name already exists.",
			}),
		).toBe(true);
	});

	it("rejects unrelated errors", () => {
		expect(isWorkspaceKernelNameConflictError(new Error("Forbidden"))).toBe(false);
	});
});
