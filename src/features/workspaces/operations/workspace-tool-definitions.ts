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
	summarizeWorkspaceReadResult,
	type WorkspaceOperationSummary,
} from "#/features/workspaces/operations/workspace-operation-observability";

export type WorkspaceToolAccess = "read" | "write";

export interface WorkspaceToolEffects {
	destructive: boolean;
	idempotent: boolean;
}

export function getWorkspaceToolScopes(
	access: WorkspaceToolAccess,
): readonly WorkspaceAccessScope[] {
	return access === "read" ? ["workspace:read"] : workspaceAccessScopes;
}

type WorkspaceToolDefinition<
	TName extends string = string,
	TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny,
> = {
	access: WorkspaceToolAccess;
	description: string;
	effects: WorkspaceToolEffects;
	execute: (
		args: z.output<TInputSchema>,
		context: WorkspaceAccessContext,
	) => Promise<z.output<TOutputSchema>>;
	inputExamples: Array<{ input: z.input<TInputSchema> }>;
	inputSchema: TInputSchema;
	name: TName;
	outputSchema: TOutputSchema;
	summarizeResult: (result: z.output<TOutputSchema>) => WorkspaceOperationSummary;
};

type RegisteredWorkspaceToolDefinition<
	TName extends string,
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
> = WorkspaceToolDefinition<TName, TInputSchema, TOutputSchema> & {
	executeUnknown: (input: unknown, context: WorkspaceAccessContext) => Promise<unknown>;
	summarizeOutput: (output: unknown) => WorkspaceOperationSummary | null;
};

function defineWorkspaceTool<
	TName extends string,
	TInputSchema extends z.ZodTypeAny,
	TOutputSchema extends z.ZodTypeAny,
>(
	definition: WorkspaceToolDefinition<TName, TInputSchema, TOutputSchema>,
): RegisteredWorkspaceToolDefinition<TName, TInputSchema, TOutputSchema> {
	const execute = async (
		args: z.output<TInputSchema>,
		context: WorkspaceAccessContext,
	): Promise<z.output<TOutputSchema>> =>
		observeWorkspaceOperation({
			context,
			mutating: definition.access === "write",
			operation: definition.name,
			run: () => definition.execute(args, context),
			summarize: definition.summarizeResult,
		});

	return {
		...definition,
		execute,
		executeUnknown: async (input, context) => {
			return await execute(definition.inputSchema.parse(input), context);
		},
		summarizeOutput: (output) => {
			const parsed = definition.outputSchema.safeParse(output);
			return parsed.success ? definition.summarizeResult(parsed.data) : null;
		},
	};
}

export const workspaceToolDefinitions = [
	defineWorkspaceTool({
		name: "workspace_list_items",
		access: "read",
		description:
			"List items by absolute workspace path. If nextOffset is present, use it as offset to continue.",
		inputSchema: workspaceListItemsInputSchema,
		inputExamples: workspaceListItemsInputExamples,
		outputSchema: workspaceListItemsOutputSchema,
		summarizeResult: summarizeWorkspaceCollectionResult,
		effects: { destructive: false, idempotent: true },
		execute: async ({ offset, path, recursive }, context) => {
			return await listWorkspaceItemsOperation(context, {
				offset,
				path,
				recursive,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_read_items",
		access: "read",
		description:
			"Read ThinkEx documents, flashcard sets, and extracted files by absolute path. Document chunks and flashcards include short, freshness-checked refs. Flashcard reads also return HTML fronts and backs plus the current user's study progress; again means missed, while hard, good, and easy mean got it. Use mode cards with a card-number range for targeted flashcard reads. Continue long documents, flashcard sets, or files with nextCursor. Use mode ref to read the exact content identified by an earlier ref; this returns elided widget source in full before editing. Files also support physical-page selections.",
		inputSchema: workspaceReadItemsInputSchema,
		inputExamples: workspaceReadItemsInputExamples,
		outputSchema: workspaceReadItemsOutputSchema,
		summarizeResult: summarizeWorkspaceReadResult,
		effects: { destructive: false, idempotent: true },
		execute: async ({ requests }, context) => {
			return await readWorkspaceItemsOperation(context, { requests });
		},
	}),
	defineWorkspaceTool({
		name: "workspace_rename_item",
		access: "write",
		description:
			"Rename one actual ThinkEx workspace item by absolute path. If the requested final path already exists, the rename fails instead of auto-renaming.",
		inputSchema: workspaceRenameItemInputSchema,
		inputExamples: workspaceRenameItemInputExamples,
		outputSchema: workspaceRenameItemOutputSchema,
		summarizeResult: summarizeWorkspaceItemResult,
		effects: { destructive: false, idempotent: true },
		execute: async ({ name, path }, context) => {
			return await renameWorkspaceItemOperation(context, {
				name,
				path,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_move_items",
		access: "write",
		description:
			"Move one or more actual ThinkEx workspace items into an existing folder or the workspace root. If the destination already has the same name, that move fails instead of auto-renaming.",
		inputSchema: workspaceMoveItemsInputSchema,
		inputExamples: workspaceMoveItemsInputExamples,
		outputSchema: workspaceMoveItemsOutputSchema,
		summarizeResult: summarizeWorkspaceCollectionResult,
		effects: { destructive: false, idempotent: true },
		execute: async ({ destinationPath, paths }, context) => {
			return await moveWorkspaceItemsOperation(context, {
				destinationPath,
				paths,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_create_items",
		access: "write",
		description:
			"Create folders, documents, or flashcard sets at exact absolute paths. A slash separates folders, so use another character inside an item name. Set type and provide that branch's fields. If a path already exists, creation fails instead of renaming.",
		inputSchema: workspaceCreateItemsInputSchema,
		inputExamples: workspaceCreateItemsInputExamples,
		outputSchema: workspaceCreateItemsOutputSchema,
		summarizeResult: summarizeWorkspaceCollectionResult,
		effects: { destructive: false, idempotent: true },
		execute: async ({ items }, context) => {
			return await createWorkspaceItemsOperation(context, {
				items,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_delete_items",
		access: "write",
		description: "Delete one or more actual ThinkEx workspace items by absolute path.",
		inputSchema: workspaceDeleteItemsInputSchema,
		inputExamples: workspaceDeleteItemsInputExamples,
		outputSchema: workspaceDeleteItemsOutputSchema,
		summarizeResult: summarizeWorkspaceCollectionResult,
		effects: { destructive: true, idempotent: true },
		execute: async ({ paths }, context) => {
			return await deleteWorkspaceItemsOperation(context, {
				paths,
			});
		},
	}),
	defineWorkspaceTool({
		name: "workspace_edit_item",
		access: "write",
		description:
			"Edit one document or flashcard set by absolute path. Read it first, then copy the exact refs it returned. The same refs also work for citations and navigation. Flashcard edits apply immediately; document edits retain their review flow. Use workspace_link_items for item-level relationships.",
		inputSchema: workspaceEditItemInputSchema,
		inputExamples: workspaceEditItemInputExamples,
		outputSchema: workspaceEditItemOutputSchema,
		summarizeResult: summarizeWorkspaceAppliedResult,
		effects: { destructive: true, idempotent: false },
		execute: async (input, context) => {
			return await editWorkspaceItemOperation(context, input);
		},
	}),
	defineWorkspaceTool({
		name: "workspace_link_items",
		access: "write",
		description:
			"Maintain internal navigation and provenance relationships between actual ThinkEx workspace items by absolute path. Use routine relationships silently as workspace context; do not announce them as separate work unless the user asked about relationships or one materially affects the answer.",
		inputSchema: workspaceLinkItemsInputSchema,
		inputExamples: workspaceLinkItemsInputExamples,
		outputSchema: workspaceLinkItemsOutputSchema,
		summarizeResult: summarizeWorkspaceItemResult,
		effects: { destructive: false, idempotent: false },
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
