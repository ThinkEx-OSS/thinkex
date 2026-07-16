import { describe, expect, it, vi } from "vitest";

vi.mock("#/db/server", () => ({
	createDbContext: vi.fn(),
}));

vi.mock("#/features/workspaces/server/permissions", () => ({
	assertCanMutateWorkspace: vi.fn(),
	assertCanReadWorkspace: vi.fn(),
}));

vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalOutcome: vi.fn(),
}));

import { getMcpOperation, mcpOperations } from "#/features/mcp/mcp-operation-catalog";
import { mcpOpenApiSpec } from "#/features/mcp/mcp-openapi";
import { workspaceToolDefinitions } from "#/features/workspaces/operations/workspace-tool-definitions";

describe("MCP operation catalog", () => {
	it("publishes every workspace operation from the canonical registry", () => {
		expect(mcpOperations.map(({ name }) => name)).toEqual([
			"workspace_list",
			...workspaceToolDefinitions.map(({ name }) => name),
		]);
	});

	it("derives OAuth scopes from read and write access", () => {
		for (const operation of mcpOperations) {
			expect(operation.requiredScope).toBe(
				operation.access === "read" ? "workspaces:read" : "workspaces:write",
			);
		}
	});

	it("marks deletion as destructive", () => {
		expect(getMcpOperation("workspace_delete_items")?.effects.destructive).toBe(true);
	});

	it("generates one allowlisted OpenAPI path per operation", () => {
		const paths = mcpOpenApiSpec.paths as Record<string, unknown>;

		expect(Object.keys(paths)).toEqual(mcpOperations.map(({ name }) => `/operations/${name}`));
	});
});
