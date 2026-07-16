import { z } from "zod";

import type { McpScope } from "#/features/mcp/mcp-config";
import { workspaceSummarySchema } from "#/features/workspaces/contracts";
import { createAccountAccessContext } from "#/features/workspaces/operations/account-access-context";
import { listAccountWorkspacesOperation } from "#/features/workspaces/operations/list-workspaces";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import {
	getWorkspaceToolScopes,
	type WorkspaceToolAccess,
	type WorkspaceToolEffects,
	workspaceToolDefinitions,
} from "#/features/workspaces/operations/workspace-tool-definitions";

export interface McpPrincipal {
	scopes: ReadonlySet<string>;
	userId: string;
}

export interface McpOperation {
	access: WorkspaceToolAccess;
	description: string;
	effects: WorkspaceToolEffects;
	execute: (input: unknown, principal: McpPrincipal, operationId: string) => Promise<unknown>;
	inputSchema: z.ZodType;
	name: string;
	outputSchema: z.ZodType;
	requiredScope: McpScope;
}

const listWorkspacesOutputSchema = z.object({
	workspaces: z.array(workspaceSummarySchema),
});

const listWorkspacesOperation: McpOperation = {
	name: "workspace_list",
	access: "read",
	description:
		"List every ThinkEx workspace the authenticated user belongs to, including their role in each workspace.",
	effects: { destructive: false, idempotent: true },
	inputSchema: z.object({}),
	outputSchema: listWorkspacesOutputSchema,
	requiredScope: "workspaces:read",
	execute: async (_input, principal) => {
		return await listAccountWorkspacesOperation(
			createAccountAccessContext({
				scopes: ["workspaces:read"],
				userId: principal.userId,
			}),
		);
	},
};

function adaptWorkspaceOperation(
	definition: (typeof workspaceToolDefinitions)[number],
): McpOperation {
	const inputSchema = z.object({
		workspaceId: z.string().min(1).describe("The workspace ID returned by workspace_list."),
		args: definition.inputSchema,
	});
	const envelopeSchema = z.object({
		workspaceId: z.string().min(1),
		args: z.unknown(),
	});

	return {
		name: definition.name,
		access: definition.access,
		description: definition.description,
		effects: definition.effects,
		inputSchema,
		outputSchema: definition.outputSchema,
		requiredScope: definition.access === "read" ? "workspaces:read" : "workspaces:write",
		execute: async (input, principal, operationId) => {
			const parsed = envelopeSchema.parse(input);

			return await definition.executeUnknown(
				parsed.args,
				createWorkspaceAccessContext({
					operationId,
					scopes: getWorkspaceToolScopes(definition.access),
					userId: principal.userId,
					workspaceId: parsed.workspaceId,
				}),
			);
		},
	};
}

export const mcpOperations: readonly McpOperation[] = [
	listWorkspacesOperation,
	...workspaceToolDefinitions.map(adaptWorkspaceOperation),
];

const mcpOperationsByName = new Map(
	mcpOperations.map((operation) => [operation.name, operation] as const),
);

export function getMcpOperation(name: string) {
	return mcpOperationsByName.get(name) ?? null;
}

export async function executeMcpOperation(input: {
	name: string;
	body: unknown;
	operationId: string;
	principal: McpPrincipal;
}) {
	const operation = getMcpOperation(input.name);

	if (!operation) {
		throw new Error("Unknown MCP operation.");
	}

	if (!input.principal.scopes.has(operation.requiredScope)) {
		throw new Error(`Missing OAuth scope: ${operation.requiredScope}`);
	}

	return await operation.execute(input.body, input.principal, input.operationId);
}
