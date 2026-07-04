import { describe, expect, it, vi } from "vitest";

vi.mock("#/lib/auth-queries.server", () => ({
	getSessionFromHeaders: vi.fn(),
}));

import { AccessScopeError } from "#/features/workspaces/operations/access-context";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import {
	mcpListItemsAccessDeniedResult,
	mcpListWorkspacesAccessDeniedResult,
	mcpReadItemsAccessDeniedResult,
	resolveMcpToolAccessFailureCode,
} from "#/features/workspaces/mcp/mcp-tool-access";

describe("resolveMcpToolAccessFailureCode", () => {
	it("maps WorkspaceForbiddenError to workspace_forbidden", () => {
		expect(resolveMcpToolAccessFailureCode(new WorkspaceForbiddenError())).toBe(
			"workspace_forbidden",
		);
	});

	it("maps AccessScopeError to insufficient_scope", () => {
		expect(
			resolveMcpToolAccessFailureCode(new AccessScopeError("workspace", "workspace:read")),
		).toBe("insufficient_scope");
	});
});

describe("mcp access denied result builders", () => {
	it("builds list workspaces denial with the provided code", () => {
		expect(mcpListWorkspacesAccessDeniedResult("insufficient_scope")).toEqual({
			workspaces: [],
			failed: [{ code: "insufficient_scope" }],
		});
	});

	it("builds list items denial with path and code", () => {
		expect(mcpListItemsAccessDeniedResult("/Course Notes", "workspace_forbidden")).toEqual({
			path: "/Course Notes",
			more: false,
			items: [],
			failed: [{ code: "workspace_forbidden" }],
		});
	});

	it("builds read items denial with the provided code", () => {
		expect(mcpReadItemsAccessDeniedResult("workspace_forbidden")).toEqual({
			items: [],
			failed: [{ code: "workspace_forbidden" }],
		});
	});
});
