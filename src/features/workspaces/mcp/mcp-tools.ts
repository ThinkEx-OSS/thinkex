import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { listAccountWorkspacesOperation } from "#/features/workspaces/operations/list-workspaces";
import { listWorkspaceItemsOperation } from "#/features/workspaces/operations/list-items";
import { readWorkspaceItemsOperation } from "#/features/workspaces/operations/read-items";
import { workspacePageRangeSchema } from "#/features/workspaces/operations/workspace-tool-schemas";
import { buildMcpAccountContext, buildMcpWorkspaceContext, type McpActor } from "./mcp-auth";

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
			inputSchema: {
				workspaceId: z.string().min(1).describe("Workspace id to list items from."),
				limit: z
					.number()
					.int()
					.min(1)
					.max(200)
					.optional()
					.describe("Maximum number of workspace items to return. Defaults to 100."),
				path: z
					.string()
					.min(1)
					.optional()
					.describe("Absolute path in the workspace. Defaults to /."),
				recursive: z
					.boolean()
					.optional()
					.describe("Include nested descendants. Defaults to false for immediate children only."),
			},
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
			inputSchema: {
				workspaceId: z.string().min(1).describe("Workspace id to read items from."),
				pages: workspacePageRangeSchema.optional(),
				paths: z
					.array(z.string().min(1))
					.min(1)
					.max(20)
					.describe("Absolute paths in the workspace to read."),
			},
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
