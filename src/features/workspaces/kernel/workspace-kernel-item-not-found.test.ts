import { describe, expect, it } from "vitest";

import {
	WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE,
	WorkspaceKernelItemNotFoundError,
	isWorkspaceKernelItemNotFoundError,
} from "#/features/workspaces/kernel/workspace-kernel-item-errors";

describe("WorkspaceKernelItemNotFoundError", () => {
	it("preserves the legacy message so existing callers keep working", () => {
		const error = new WorkspaceKernelItemNotFoundError("item-1");

		expect(error.message).toBe(WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE);
		expect(error.name).toBe("WorkspaceKernelItemNotFoundError");
		expect(error.itemId).toBe("item-1");
	});
});

describe("isWorkspaceKernelItemNotFoundError", () => {
	it("detects the typed error in-process", () => {
		expect(isWorkspaceKernelItemNotFoundError(new WorkspaceKernelItemNotFoundError("item-1"))).toBe(
			true,
		);
	});

	it("detects an error reconstructed across the RPC boundary by name", () => {
		// The Agent stub rebuilds thrown errors as plain Errors, dropping the
		// prototype but keeping the name and message.
		const reconstructed = new Error(WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE);
		reconstructed.name = "WorkspaceKernelItemNotFoundError";

		expect(isWorkspaceKernelItemNotFoundError(reconstructed)).toBe(true);
	});

	it("detects an error reconstructed across the RPC boundary by message alone", () => {
		expect(
			isWorkspaceKernelItemNotFoundError(new Error(WORKSPACE_KERNEL_ITEM_NOT_FOUND_MESSAGE)),
		).toBe(true);
	});

	it("ignores unrelated errors", () => {
		expect(isWorkspaceKernelItemNotFoundError(new Error("Workspace item is not a file."))).toBe(
			false,
		);
		expect(isWorkspaceKernelItemNotFoundError("Workspace item not found.")).toBe(false);
		expect(isWorkspaceKernelItemNotFoundError(null)).toBe(false);
	});
});
