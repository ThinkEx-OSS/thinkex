import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { listAccountWorkspacesOperation } from "#/features/workspaces/operations/list-workspaces";
import { listWorkspaceItemsOperation } from "#/features/workspaces/operations/list-items";
import { readWorkspaceItemsOperation } from "#/features/workspaces/operations/read-items";
import { buildMcpAccountContext, buildMcpWorkspaceContext, type McpActor } from "./mcp-auth";
import { mcpListItemsInputSchema, mcpReadItemsInputSchema } from "./mcp-schemas";

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

export function registerMcpTools(server: McpServer, actor: McpActor): void {
	server.registerTool(
		"thinkex_list_workspaces",
		{
			description: "List workspaces accessible to the authenticated user.",
		},
		async () => {
			const context = buildMcpAccountContext(actor);
			const { workspaces } = await listAccountWorkspacesOperation(context);

			return mcpTextResult({
				workspaces: workspaces.map(({ id, name, description, membershipRole }) => ({
					id,
					name,
					description,
					role: membershipRole,
				})),
			});
		},
	);

	server.registerTool(
		"thinkex_workspace_list_items",
		{
			description: "List items in a ThinkEx workspace by absolute path.",
			inputSchema: mcpListItemsInputSchema,
		},
		async ({ workspaceId, limit, path, recursive }) => {
			const context = buildMcpWorkspaceContext(actor, workspaceId);
			const result = await listWorkspaceItemsOperation(context, {
				path,
				recursive,
				limit,
			});

			return mcpTextResult(result);
		},
	);

	server.registerTool(
		"thinkex_workspace_read_items",
		{
			description:
				"Read ThinkEx documents and files by absolute path. Use pages for continuation: PDF pages for PDFs, 1000-line Markdown pages for documents and extracted files.",
			inputSchema: mcpReadItemsInputSchema,
		},
		async ({ workspaceId, pages, paths }) => {
			const context = buildMcpWorkspaceContext(actor, workspaceId);
			const result = await readWorkspaceItemsOperation(context, {
				pages,
				paths,
			});

			return mcpTextResult(result);
		},
	);
}
