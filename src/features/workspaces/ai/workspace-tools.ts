import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/ai/workspace-reference";
import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import {
	workspaceToolDefinitions,
	getWorkspaceToolScopes,
	type WorkspaceToolDefinition,
} from "#/features/workspaces/operations/workspace-tool-definitions";
import {
	createWorkspaceAccessContext,
	type WorkspaceAccessContext,
	type WorkspaceAccessScope,
} from "#/features/workspaces/operations/workspace-access-context";

type WorkspaceThreadToolConfig = {
	definition: WorkspaceToolDefinition;
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
};

function createWorkspaceThreadTool(input: WorkspaceThreadToolConfig) {
	const { definition } = input;

	return defineAIThreadTool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		strict: true,
		...(definition.toModelOutput ? { toModelOutput: definition.toModelOutput } : {}),
		execute: async (args, context) => {
			const thread = await requireThreadContext(input.getThreadContext);

			const output = await definition.execute(
				args,
				createThreadWorkspaceAccessContext(
					thread,
					getWorkspaceToolScopes(definition.access),
					context.invocationId,
				),
			);

			if (definition.name === "workspace_read_items" && input.onWorkspaceReferences) {
				const parsed = workspaceReadItemsOutputSchema.safeParse(output);
				if (parsed.success) {
					input.onWorkspaceReferences(parsed.data.references);
				}
			}

			return output;
		},
	});
}

export function createAIThreadWorkspaceTools(input: {
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
}): ToolSet {
	return Object.fromEntries(
		workspaceToolDefinitions.map((definition) => [
			definition.name,
			createWorkspaceThreadTool({
				// SAFETY: Every registered definition is created by defineWorkspaceTool, which binds
				// toModelOutput to the same input/output schemas used by execute. This is the one
				// heterogeneous registry seam where those individual generic types are erased.
				definition: definition as WorkspaceToolDefinition,
				getThreadContext: input.getThreadContext,
				onWorkspaceReferences: input.onWorkspaceReferences,
			}),
		]),
	) as ToolSet;
}

async function requireThreadContext(getThreadContext: () => Promise<AIThreadContext | null>) {
	const thread = await getThreadContext();

	if (!thread) {
		throw new Error("Chat thread not found");
	}

	return thread;
}

function createThreadWorkspaceAccessContext(
	thread: AIThreadContext,
	scopes: readonly WorkspaceAccessScope[],
	operationId: string,
): WorkspaceAccessContext {
	return createWorkspaceAccessContext({
		operationId,
		scopes,
		userId: thread.userId,
		workspaceId: thread.workspaceId,
	});
}
