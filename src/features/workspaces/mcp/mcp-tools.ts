import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ListWorkspaceKernelItemsResult } from "#/features/workspaces/kernel/workspace-kernel-list";
import { listAccountWorkspacesOperation } from "#/features/workspaces/operations/list-workspaces";
import { listWorkspaceItemsOperation } from "#/features/workspaces/operations/list-items";
import { readWorkspaceItemsOperation } from "#/features/workspaces/operations/read-items";
import { recordMcpToolCallFromActor } from "#/features/workspaces/mcp/mcp-audit";
import { buildMcpAccountContext, buildMcpWorkspaceContext, type McpActor } from "./mcp-auth";
import { capMcpReadItemsContent, type McpReadItemsResult } from "./mcp-read-content-cap";
import { mcpListItemsInputSchema, mcpReadItemsInputSchema } from "./mcp-schemas";
import {
	isMcpToolAccessError,
	mcpListItemsAccessDeniedResult,
	mcpListWorkspacesAccessDeniedResult,
	mcpReadItemsAccessDeniedResult,
	resolveMcpToolAccessFailureCode,
	type McpToolAccessFailureCode,
} from "./mcp-tool-access";

export { mcpListItemsInputSchema, mcpReadItemsInputSchema } from "./mcp-schemas";

function mcpTextResult(result: unknown) {
	return {
		content: [
			{
				type: "text" as const,
				text: JSON.stringify(result),
			},
		],
	};
}

async function runMcpTool<TResult>(input: {
	actor: McpActor;
	deniedResultForCode: (code: McpToolAccessFailureCode) => TResult;
	run: () => Promise<TResult>;
	toolName: string;
	workspaceId?: string;
}) {
	try {
		const result = await input.run();
		recordMcpToolCallFromActor(input.actor, {
			resultStatus: "ok",
			toolName: input.toolName,
			workspaceId: input.workspaceId,
		});
		return mcpTextResult(result);
	} catch (error) {
		if (isMcpToolAccessError(error)) {
			recordMcpToolCallFromActor(input.actor, {
				resultStatus: "denied",
				toolName: input.toolName,
				workspaceId: input.workspaceId,
			});
			return mcpTextResult(input.deniedResultForCode(resolveMcpToolAccessFailureCode(error)));
		}

		recordMcpToolCallFromActor(input.actor, {
			resultStatus: "failed",
			toolName: input.toolName,
			workspaceId: input.workspaceId,
		});
		throw error;
	}
}

export function registerMcpTools(server: McpServer, actor: McpActor): void {
	server.registerTool(
		"thinkex_list_workspaces",
		{
			description: "List workspaces accessible to the authenticated user.",
		},
		async () =>
			runMcpTool({
				actor,
				deniedResultForCode: mcpListWorkspacesAccessDeniedResult,
				toolName: "thinkex_list_workspaces",
				run: async () => {
					const context = buildMcpAccountContext(actor);
					const { workspaces } = await listAccountWorkspacesOperation(context);

					return {
						workspaces: workspaces.map(({ id, name, description, membershipRole }) => ({
							id,
							name,
							description,
							role: membershipRole,
						})),
					};
				},
			}),
	);

	server.registerTool(
		"thinkex_workspace_list_items",
		{
			description: "List items in a ThinkEx workspace by absolute path.",
			inputSchema: mcpListItemsInputSchema,
		},
		async ({ workspaceId, limit, path, recursive }) =>
			runMcpTool<ListWorkspaceKernelItemsResult>({
				actor,
				deniedResultForCode: (code) =>
					mcpListItemsAccessDeniedResult(
						path ?? "/",
						code,
					) as unknown as ListWorkspaceKernelItemsResult,
				toolName: "thinkex_workspace_list_items",
				workspaceId,
				run: async () => {
					const context = buildMcpWorkspaceContext(actor, workspaceId);
					return listWorkspaceItemsOperation(context, {
						path,
						recursive,
						limit,
					});
				},
			}),
	);

	server.registerTool(
		"thinkex_workspace_read_items",
		{
			description: "Read documents and files in a ThinkEx workspace by absolute path.",
			inputSchema: mcpReadItemsInputSchema,
		},
		async ({ workspaceId, pages, paths }) =>
			runMcpTool<McpReadItemsResult>({
				actor,
				deniedResultForCode: (code) =>
					mcpReadItemsAccessDeniedResult(code) as unknown as McpReadItemsResult,
				toolName: "thinkex_workspace_read_items",
				workspaceId,
				run: async () => {
					const context = buildMcpWorkspaceContext(actor, workspaceId);
					const result = await readWorkspaceItemsOperation(context, {
						pages,
						paths,
					});

					return capMcpReadItemsContent(result);
				},
			}),
	);
}
