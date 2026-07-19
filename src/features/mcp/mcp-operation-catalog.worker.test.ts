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

vi.mock("#/features/workspaces/operations/list-workspaces", () => ({
	listAccountWorkspacesOperation: vi.fn(async () => ({ workspaces: "invalid" })),
}));

import {
	executeMcpOperation,
	getMcpOperation,
	mcpOperations,
} from "#/features/mcp/mcp-operation-catalog";
import { mcpOpenApiSpec } from "#/features/mcp/mcp-openapi";
import {
	AI_TOOL_REGISTRY,
	requireAiToolDefinition,
} from "#/features/workspaces/ai/ai-tool-registry";
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

	it("keeps AI model access aligned with workspace operation access", () => {
		for (const definition of workspaceToolDefinitions) {
			expect(requireAiToolDefinition(definition.name).model.access).toBe(definition.access);
		}
	});

	it("keeps every workspace operation synchronized with the AI registry", () => {
		const operationNames = mcpOperations
			.map(({ name }) => name)
			.filter((name) => name !== "workspace_list")
			.sort();
		const registeredNames = Object.keys(AI_TOOL_REGISTRY)
			.filter((name) => name.startsWith("workspace_"))
			.sort();

		for (const name of operationNames) {
			expect(() => requireAiToolDefinition(name)).not.toThrow();
		}
		expect(operationNames).toEqual(registeredNames);
	});

	it("generates one allowlisted OpenAPI path per operation", () => {
		const paths = mcpOpenApiSpec.paths as Record<string, unknown>;

		expect(Object.keys(paths)).toEqual(mcpOperations.map(({ name }) => `/operations/${name}`));
	});

	it("validates operation output before returning it to MCP", async () => {
		await expect(
			executeMcpOperation({
				name: "workspace_list",
				body: {},
				operationId: "mcp:test",
				principal: {
					scopes: new Set(["workspaces:read"]),
					userId: "test-user",
				},
			}),
		).rejects.toThrow();
	});
});
