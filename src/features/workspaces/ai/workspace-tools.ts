import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import { getWorkspaceToolResultAdapter } from "#/features/workspaces/ai/workspace-tool-result-adapters";
import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";
import {
	workspaceToolDefinitions,
	getWorkspaceToolScopes,
} from "#/features/workspaces/operations/workspace-tool-definitions";
import {
	createWorkspaceAccessContext,
	type WorkspaceAccessContext,
	type WorkspaceAccessScope,
} from "#/features/workspaces/operations/workspace-access-context";

type WorkspaceThreadToolConfig = {
	definition: (typeof workspaceToolDefinitions)[number];
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
};

function createWorkspaceThreadTool(input: WorkspaceThreadToolConfig) {
	const { definition } = input;
	const resultAdapter = getWorkspaceToolResultAdapter(definition.name);

	return defineAIThreadTool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		strict: true,
		...(resultAdapter
			? {
					toModelOutput: ({ output }) => ({
						type: "json" as const,
						value: resultAdapter.projectOutput(output),
					}),
				}
			: {}),
		execute: async (args, context) => {
			const thread = await requireThreadContext(input.getThreadContext);

			const output = await definition.executeUnknown(
				args,
				createThreadWorkspaceAccessContext(
					thread,
					getWorkspaceToolScopes(definition.access),
					context.invocationId,
				),
			);

			const references = resultAdapter?.collectReferences(output) ?? [];
			if (references.length > 0 && input.onWorkspaceReferences) {
				input.onWorkspaceReferences(references);
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
