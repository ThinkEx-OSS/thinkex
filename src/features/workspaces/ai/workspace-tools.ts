import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import { createWorkspaceReadItemsModelOutput } from "#/features/workspaces/content/workspace-read-references";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";
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
	const isWorkspaceRead = definition.name === "workspace_read_items";

	return defineAIThreadTool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		strict: true,
		...(isWorkspaceRead
			? {
					toModelOutput: ({ output }) => ({
						type: "json" as const,
						value: createWorkspaceReadItemsModelOutput(
							workspaceReadItemsOutputSchema.parse(output),
						),
					}),
				}
			: {}),
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

			if (isWorkspaceRead && input.onWorkspaceReferences) {
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
				definition,
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
