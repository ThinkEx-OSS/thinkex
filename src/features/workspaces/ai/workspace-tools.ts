import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import { createPendingPdfModelOutput } from "#/features/workspaces/ai/workspace-read-file-fallback";
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
	env: Cloudflare.Env;
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
};

function createWorkspaceThreadTool(input: WorkspaceThreadToolConfig) {
	const { definition } = input;
	const resultAdapter = getWorkspaceToolResultAdapter(definition.name);
	const freshWorkspaceIds = new Map<string, string>();

	return defineAIThreadTool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		...(resultAdapter
			? {
					toModelOutput: async ({ input: toolInput, output, toolCallId }) => {
						const workspaceId = freshWorkspaceIds.get(toolCallId);
						if (definition.name === "workspace_read_items" && workspaceId) {
							const fileOutput = await createPendingPdfModelOutput({
								env: input.env,
								toolInput,
								toolOutput: output,
								workspaceId,
							});
							if (fileOutput) {
								return fileOutput;
							}
						}

						return {
							type: "json" as const,
							value: resultAdapter.projectOutput(output),
						};
					},
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
					input.resolveWorkspaceReferences,
				),
			);

			const references = resultAdapter?.collectReferences(output) ?? [];
			if (references.length > 0 && input.onWorkspaceReferences) {
				input.onWorkspaceReferences(references);
			}
			if (definition.name === "workspace_read_items") {
				freshWorkspaceIds.set(context.invocationId, thread.workspaceId);
			}

			return output;
		},
	});
}

export function createAIThreadWorkspaceTools(input: {
	env: Cloudflare.Env;
	getThreadContext: () => Promise<AIThreadContext | null>;
	onWorkspaceReferences?: (records: readonly WorkspaceReferenceRecord[]) => void;
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>;
}): ToolSet {
	return Object.fromEntries(
		workspaceToolDefinitions.map((definition) => [
			definition.name,
			createWorkspaceThreadTool({
				definition,
				env: input.env,
				getThreadContext: input.getThreadContext,
				onWorkspaceReferences: input.onWorkspaceReferences,
				resolveWorkspaceReferences: input.resolveWorkspaceReferences,
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
	resolveWorkspaceReferences?: (refs: readonly string[]) => Promise<WorkspaceReferenceRecord[]>,
): WorkspaceAccessContext {
	return createWorkspaceAccessContext({
		operationId,
		...(resolveWorkspaceReferences ? { resolveWorkspaceReferences } : {}),
		scopes,
		userId: thread.userId,
		workspaceId: thread.workspaceId,
	});
}
