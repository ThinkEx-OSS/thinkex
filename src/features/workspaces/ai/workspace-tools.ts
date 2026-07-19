import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
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
};

function createWorkspaceThreadTool(input: WorkspaceThreadToolConfig) {
	const { definition } = input;

	return defineAIThreadTool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		strict: true,
		execute: async (args, context) => {
			const thread = await requireThreadContext(input.getThreadContext);

			return await definition.execute(
				args,
				createThreadWorkspaceAccessContext(
					thread,
					getWorkspaceToolScopes(definition.access),
					context.invocationId,
				),
			);
		},
	});
}

export function createAIThreadWorkspaceTools(input: {
	getThreadContext: () => Promise<AIThreadContext | null>;
}): ToolSet {
	return Object.fromEntries(
		workspaceToolDefinitions.map((definition) => [
			definition.name,
			createWorkspaceThreadTool({
				definition,
				getThreadContext: input.getThreadContext,
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
