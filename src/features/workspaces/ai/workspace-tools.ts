import type { ToolSet } from "ai";
import { tool } from "ai";
import type { z } from "zod";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import {
	createWorkspaceCapabilityContext,
	type WorkspaceCapabilityScope,
	type WorkspaceCapabilityContext,
	workspaceCapabilityScopes,
} from "#/features/workspaces/capabilities/workspace-capability-context";
import { createWorkspaceCapabilityItems } from "#/features/workspaces/capabilities/create-items";
import { deleteWorkspaceCapabilityItems } from "#/features/workspaces/capabilities/delete-items";
import { editWorkspaceCapabilityItem } from "#/features/workspaces/capabilities/edit-item";
import { listWorkspaceCapabilityItems } from "#/features/workspaces/capabilities/list-items";
import { moveWorkspaceCapabilityItems } from "#/features/workspaces/capabilities/move-items";
import { readWorkspaceCapabilityItems } from "#/features/workspaces/capabilities/read-items";
import { renameWorkspaceCapabilityItem } from "#/features/workspaces/capabilities/rename-item";
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
} from "#/features/workspaces/capabilities/tool-schemas";

const workspaceReadCapabilityScopes: readonly WorkspaceCapabilityScope[] = ["workspace:read"];
const workspaceMutateCapabilityScopes = workspaceCapabilityScopes;

type WorkspaceThreadToolConfig<
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
> = {
	description: string;
	execute: (
		args: z.output<TInputSchema>,
		context: WorkspaceCapabilityContext,
	) => Promise<z.output<TOutputSchema>>;
	getThreadContext: () => Promise<AIThreadContext | null>;
	inputExamples: Array<{ input: z.input<TInputSchema> }>;
	inputSchema: TInputSchema;
	outputSchema: TOutputSchema;
	scopes: readonly WorkspaceCapabilityScope[];
};

function createWorkspaceThreadTool<
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
>(input: WorkspaceThreadToolConfig<TInputSchema, TOutputSchema>) {
	return tool({
		description: input.description,
		inputSchema: input.inputSchema,
		inputExamples: input.inputExamples,
		outputSchema: input.outputSchema,
		strict: true,
		execute: async (args) => {
			const thread = await requireThreadContext(input.getThreadContext);

			return await input.execute(
				args as z.output<TInputSchema>,
				createThreadWorkspaceCapabilityContext(thread, input.scopes),
			);
		},
	});
}

export function createAIThreadWorkspaceTools(input: {
	getThreadContext: () => Promise<AIThreadContext | null>;
}): ToolSet {
	const createThreadTool = <TInputSchema extends z.ZodTypeAny, TOutputSchema extends z.ZodTypeAny>(
		config: Omit<WorkspaceThreadToolConfig<TInputSchema, TOutputSchema>, "getThreadContext">,
	) => {
		return createWorkspaceThreadTool({
			...config,
			getThreadContext: input.getThreadContext,
		});
	};

	return {
		workspace_list_items: createThreadTool({
			description: "List items in the actual ThinkEx workspace by absolute path.",
			inputSchema: workspaceListItemsInputSchema,
			inputExamples: workspaceListItemsInputExamples,
			outputSchema: workspaceListItemsOutputSchema,
			scopes: workspaceReadCapabilityScopes,
			execute: async ({ limit, path, recursive }, context) => {
				return await listWorkspaceCapabilityItems(context, {
					path,
					recursive,
					limit,
				});
			},
		}),
		workspace_read_items: createThreadTool({
			description:
				"Read ThinkEx documents and files by absolute path. Use pages for continuation: PDF pages for PDFs, 1000-line Markdown pages for documents and extracted files. Defaults to page 1. Check pages.total before reading more.",
			inputSchema: workspaceReadItemsInputSchema,
			inputExamples: workspaceReadItemsInputExamples,
			outputSchema: workspaceReadItemsOutputSchema,
			scopes: workspaceReadCapabilityScopes,
			execute: async ({ pages, paths }, context) => {
				return await readWorkspaceCapabilityItems(context, {
					pages,
					paths,
				});
			},
		}),
		workspace_rename_item: createThreadTool({
			description:
				"Rename one actual ThinkEx workspace item by absolute path. If the requested final path already exists, the rename fails instead of auto-renaming.",
			inputSchema: workspaceRenameItemInputSchema,
			inputExamples: workspaceRenameItemInputExamples,
			outputSchema: workspaceRenameItemOutputSchema,
			scopes: workspaceMutateCapabilityScopes,
			execute: async ({ name, path }, context) => {
				return await renameWorkspaceCapabilityItem(context, {
					name,
					path,
				});
			},
		}),
		workspace_move_items: createThreadTool({
			description:
				"Move one or more actual ThinkEx workspace items into an existing folder or the workspace root. If the destination already has the same name, that move fails instead of auto-renaming.",
			inputSchema: workspaceMoveItemsInputSchema,
			inputExamples: workspaceMoveItemsInputExamples,
			outputSchema: workspaceMoveItemsOutputSchema,
			scopes: workspaceMutateCapabilityScopes,
			execute: async ({ destinationPath, paths }, context) => {
				return await moveWorkspaceCapabilityItems(context, {
					destinationPath,
					paths,
				});
			},
		}),
		workspace_create_items: createThreadTool({
			description: `Create one or more folders or documents at exact absolute paths. If a path already exists, creation fails instead of renaming. ${workspaceDocumentMarkdownMathInstruction}`,
			inputSchema: workspaceCreateItemsInputSchema,
			inputExamples: workspaceCreateItemsInputExamples,
			outputSchema: workspaceCreateItemsOutputSchema,
			scopes: workspaceMutateCapabilityScopes,
			execute: async ({ items }, context) => {
				return await createWorkspaceCapabilityItems(context, {
					items,
				});
			},
		}),
		workspace_delete_items: createThreadTool({
			description: "Delete one or more actual ThinkEx workspace items by absolute path.",
			inputSchema: workspaceDeleteItemsInputSchema,
			inputExamples: workspaceDeleteItemsInputExamples,
			outputSchema: workspaceDeleteItemsOutputSchema,
			scopes: workspaceMutateCapabilityScopes,
			execute: async ({ paths }, context) => {
				return await deleteWorkspaceCapabilityItems(context, {
					paths,
				});
			},
		}),
		workspace_edit_item: createThreadTool({
			description: `Edit one actual ThinkEx workspace document by absolute path. Read before editing unless the user requested a simple append or prepend. ${workspaceDocumentMarkdownMathInstruction}`,
			inputSchema: workspaceEditItemInputSchema,
			inputExamples: workspaceEditItemInputExamples,
			outputSchema: workspaceEditItemOutputSchema,
			scopes: workspaceMutateCapabilityScopes,
			execute: async ({ path, edits }, context) => {
				return await editWorkspaceCapabilityItem(context, {
					path,
					edits,
				});
			},
		}),
	};
}

async function requireThreadContext(getThreadContext: () => Promise<AIThreadContext | null>) {
	const thread = await getThreadContext();

	if (!thread) {
		throw new Error("Chat thread not found");
	}

	return thread;
}

function createThreadWorkspaceCapabilityContext(
	thread: AIThreadContext,
	scopes: readonly WorkspaceCapabilityScope[],
): WorkspaceCapabilityContext {
	return createWorkspaceCapabilityContext({
		scopes,
		userId: thread.userId,
		workspaceId: thread.workspaceId,
	});
}
