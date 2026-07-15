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
import {
	observeWorkspaceOperation,
	summarizeWorkspaceAppliedResult,
	summarizeWorkspaceCollectionResult,
	summarizeWorkspaceItemResult,
	type WorkspaceOperationSummary,
} from "#/features/workspaces/operations/workspace-operation-observability";

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
	summarizeResult: (result: z.output<TOutputSchema>) => WorkspaceOperationSummary;
	scopes: readonly WorkspaceAccessScope[];
};

type RegisteredWorkspaceToolDefinition<
	TName extends string,
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
> = WorkspaceToolDefinition<TName, TInputSchema, TOutputSchema> & {
	summarizeOutput: (output: unknown) => WorkspaceOperationSummary | null;
};

function defineWorkspaceTool<
	TName extends string,
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
>(
	definition: WorkspaceToolDefinition<TName, TInputSchema, TOutputSchema>,
): RegisteredWorkspaceToolDefinition<TName, TInputSchema, TOutputSchema> {
	return {
		...definition,
		execute: async (
			args: z.output<TInputSchema>,
			context: WorkspaceAccessContext,
		): Promise<z.output<TOutputSchema>> =>
			observeWorkspaceOperation({
				context,
				mutating: definition.mutating,
				operation: definition.name,
				run: () => definition.execute(args, context),
				summarize: definition.summarizeResult,
			}),
		summarizeOutput: (output) => {
			const parsed = definition.outputSchema.safeParse(output);
			return parsed.success ? definition.summarizeResult(parsed.data) : null;
		},
	};
}

export const workspaceToolDefinitions = [
	defineWorkspaceTool({
		name: "workspace_list_items",
		description:
			"List items by absolute workspace path. If nextOffset is present, use it as offset to continue.",
		inputSchema: workspaceListItemsInputSchema,
		inputExamples: workspaceListItemsInputExamples,
		outputSchema: workspaceListItemsOutputSchema,
		summarizeResult: summarizeWorkspaceCollectionResult,
		scopes: workspaceReadScopes,
		mutating: false,
		execute: async ({ limit, offset, path, recursive }, context) => {
			return await listWorkspaceItemsOperation(context, {
				offset,
				path,
				recursive,
				limit,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_read_items",
		description:
			"Read ThinkEx documents and files by absolute path. Use pages for continuation: PDF pages for PDFs, 1000-line Markdown pages for documents and extracted files. Defaults to page 1; read at most 20 pages per call and check pages.total before continuing.",
		inputSchema: workspaceReadItemsInputSchema,
		inputExamples: workspaceReadItemsInputExamples,
		outputSchema: workspaceReadItemsOutputSchema,
		summarizeResult: summarizeWorkspaceCollectionResult,
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
		summarizeResult: summarizeWorkspaceItemResult,
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
		summarizeResult: summarizeWorkspaceCollectionResult,
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
		summarizeResult: summarizeWorkspaceCollectionResult,
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
		summarizeResult: summarizeWorkspaceCollectionResult,
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
		summarizeResult: summarizeWorkspaceAppliedResult,
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
		summarizeResult: summarizeWorkspaceItemResult,
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

export function getWorkspaceToolDefinition(name: string) {
	return workspaceToolDefinitions.find((definition) => definition.name === name) ?? null;
}

export function summarizeWorkspaceToolOutput(name: string, output: unknown) {
	const definition = getWorkspaceToolDefinition(name);
	if (!definition) {
		return null;
	}

	return definition.summarizeOutput(output);
}
