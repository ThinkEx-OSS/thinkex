import type { z } from "zod";

import { createWorkspaceItemsOperation } from "#/features/workspaces/operations/create-items";
import { deleteWorkspaceItemsOperation } from "#/features/workspaces/operations/delete-items";
import { editWorkspaceItemOperation } from "#/features/workspaces/operations/edit-item";
import { linkWorkspaceItemsOperation } from "#/features/workspaces/operations/link-items";
import { listWorkspaceItemsOperation } from "#/features/workspaces/operations/list-items";
import { moveWorkspaceItemsOperation } from "#/features/workspaces/operations/move-items";
import { readWorkspaceItemsOperation } from "#/features/workspaces/operations/read-items";
import { renameWorkspaceItemOperation } from "#/features/workspaces/operations/rename-item";
import {
	workspaceCreateItemsInputExamples,
	workspaceCreateItemsInputSchema,
	workspaceCreateItemsOutputSchema,
	workspaceDeleteItemsInputExamples,
	workspaceDeleteItemsInputSchema,
	workspaceDeleteItemsOutputSchema,
	workspaceDocumentMarkdownMathInstruction,
	workspaceEditItemInputExamples,
	workspaceEditItemInputSchema,
	workspaceEditItemOutputSchema,
	workspaceLinkItemsInputExamples,
	workspaceLinkItemsInputSchema,
	workspaceLinkItemsOutputSchema,
	workspaceListItemsInputExamples,
	workspaceListItemsInputSchema,
	workspaceListItemsOutputSchema,
	workspaceMoveItemsInputExamples,
	workspaceMoveItemsInputSchema,
	workspaceMoveItemsOutputSchema,
	workspaceReadItemsInputExamples,
	workspaceReadItemsInputSchema,
	workspaceReadItemsOutputSchema,
	workspaceRenameItemInputExamples,
	workspaceRenameItemInputSchema,
	workspaceRenameItemOutputSchema,
} from "#/features/workspaces/operations/workspace-tool-schemas";
import type {
	WorkspaceAccessContext,
	WorkspaceAccessScope,
} from "#/features/workspaces/operations/workspace-access-context";
import { workspaceAccessScopes } from "#/features/workspaces/operations/workspace-access-context";

const workspaceReadScopes = ["workspace:read"] as const satisfies readonly WorkspaceAccessScope[];
const workspaceWriteScopes = workspaceAccessScopes;

export type WorkspaceToolDefinition<
	TName extends string = string,
	TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> = {
	description: string;
	execute: (
		args: z.output<TInputSchema>,
		context: WorkspaceAccessContext,
	) => Promise<z.output<TOutputSchema>>;
	inputExamples: Array<{ input: z.input<TInputSchema> }>;
	inputSchema: TInputSchema;
	mutating: boolean;
	name: TName;
	outputSchema: TOutputSchema;
	scopes: readonly WorkspaceAccessScope[];
};

function defineWorkspaceTool<
	TName extends string,
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
>(definition: WorkspaceToolDefinition<TName, TInputSchema, TOutputSchema>) {
	return definition;
}

export const workspaceToolDefinitions = [
	defineWorkspaceTool({
		name: "workspace_list_items",
		description: "List items in the actual ThinkEx workspace by absolute path.",
		inputSchema: workspaceListItemsInputSchema,
		inputExamples: workspaceListItemsInputExamples,
		outputSchema: workspaceListItemsOutputSchema,
		scopes: workspaceReadScopes,
		mutating: false,
		execute: async ({ limit, path, recursive }, context) => {
			return await listWorkspaceItemsOperation(context, {
				path,
				recursive,
				limit,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_read_items",
		description:
			"Read ThinkEx documents and files by absolute path. Use pages for continuation: PDF pages for PDFs, 1000-line Markdown pages for documents and extracted files. Defaults to page 1. Check pages.total before reading more.",
		inputSchema: workspaceReadItemsInputSchema,
		inputExamples: workspaceReadItemsInputExamples,
		outputSchema: workspaceReadItemsOutputSchema,
		scopes: workspaceReadScopes,
		mutating: false,
		execute: async ({ pages, paths }, context) => {
			return await readWorkspaceItemsOperation(context, {
				pages,
				paths,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_rename_item",
		description:
			"Rename one actual ThinkEx workspace item by absolute path. If the requested final path already exists, the rename fails instead of auto-renaming.",
		inputSchema: workspaceRenameItemInputSchema,
		inputExamples: workspaceRenameItemInputExamples,
		outputSchema: workspaceRenameItemOutputSchema,
		scopes: workspaceWriteScopes,
		mutating: true,
		execute: async ({ name, path }, context) => {
			return await renameWorkspaceItemOperation(context, {
				name,
				path,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_move_items",
		description:
			"Move one or more actual ThinkEx workspace items into an existing folder or the workspace root. If the destination already has the same name, that move fails instead of auto-renaming.",
		inputSchema: workspaceMoveItemsInputSchema,
		inputExamples: workspaceMoveItemsInputExamples,
		outputSchema: workspaceMoveItemsOutputSchema,
		scopes: workspaceWriteScopes,
		mutating: true,
		execute: async ({ destinationPath, paths }, context) => {
			return await moveWorkspaceItemsOperation(context, {
				destinationPath,
				paths,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_create_items",
		description: `Create one or more folders or documents at exact absolute paths. If a path already exists, creation fails instead of renaming. ${workspaceDocumentMarkdownMathInstruction}`,
		inputSchema: workspaceCreateItemsInputSchema,
		inputExamples: workspaceCreateItemsInputExamples,
		outputSchema: workspaceCreateItemsOutputSchema,
		scopes: workspaceWriteScopes,
		mutating: true,
		execute: async ({ items }, context) => {
			return await createWorkspaceItemsOperation(context, {
				items,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_delete_items",
		description: "Delete one or more actual ThinkEx workspace items by absolute path.",
		inputSchema: workspaceDeleteItemsInputSchema,
		inputExamples: workspaceDeleteItemsInputExamples,
		outputSchema: workspaceDeleteItemsOutputSchema,
		scopes: workspaceWriteScopes,
		mutating: true,
		execute: async ({ paths }, context) => {
			return await deleteWorkspaceItemsOperation(context, {
				paths,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_edit_item",
		description: `Edit one actual ThinkEx workspace document by absolute path, or add relationships from any workspace item. Read before editing unless the user requested a simple append or prepend. ${workspaceDocumentMarkdownMathInstruction}`,
		inputSchema: workspaceEditItemInputSchema,
		inputExamples: workspaceEditItemInputExamples,
		outputSchema: workspaceEditItemOutputSchema,
		scopes: workspaceWriteScopes,
		mutating: true,
		execute: async ({ path, edits, relations }, context) => {
			return await editWorkspaceItemOperation(context, {
				path,
				edits,
				relations,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_link_items",
		description:
			"Create relationships from one actual ThinkEx workspace item to other workspace items by absolute path.",
		inputSchema: workspaceLinkItemsInputSchema,
		inputExamples: workspaceLinkItemsInputExamples,
		outputSchema: workspaceLinkItemsOutputSchema,
		scopes: workspaceWriteScopes,
		mutating: true,
		execute: async ({ path, relations }, context) => {
			return await linkWorkspaceItemsOperation(context, {
				path,
				relations,
			});
		},
	}),
] as const;

export type WorkspaceToolName = (typeof workspaceToolDefinitions)[number]["name"];
