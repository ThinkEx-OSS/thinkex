import type { ToolSet } from "ai";
import { tool } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import {
	workspaceToolDefinitions,
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

	return tool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		strict: true,
		execute: async (args) => {
			const thread = await requireThreadContext(input.getThreadContext);

			return await definition.execute(
				args,
				createThreadWorkspaceAccessContext(thread, definition.scopes),
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
): WorkspaceAccessContext {
	return createWorkspaceAccessContext({
		scopes,
		userId: thread.userId,
		workspaceId: thread.workspaceId,
	});
}
