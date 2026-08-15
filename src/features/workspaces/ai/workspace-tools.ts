import type { ToolSet } from "ai";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import {
	createPendingPdfModelOutput,
	isPendingPdfFallbackInput,
} from "#/features/workspaces/ai/workspace-read-file-fallback";
import { getWorkspaceToolResultAdapter } from "#/features/workspaces/ai/workspace-tool-result-adapters";
import {
	workspaceToolDefinitions,
	getWorkspaceToolScopes,
} from "#/features/workspaces/operations/workspace-tool-definitions";
import { createWorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";

type WorkspaceThreadToolConfig = {
	definition: (typeof workspaceToolDefinitions)[number];
	env: Cloudflare.Env;
	getThreadContext: () => Promise<AIThreadContext | null>;
};

function createWorkspaceThreadTool(input: WorkspaceThreadToolConfig) {
	const { definition } = input;
	const resultAdapter = getWorkspaceToolResultAdapter(definition.name);
	// Projection also runs for history; only fresh calls may hydrate raw bytes.
	const freshWorkspaceIds =
		definition.name === "workspace_read_items" ? new Map<string, string>() : null;

	return defineAIThreadTool({
		description: definition.description,
		inputSchema: definition.inputSchema,
		inputExamples: definition.inputExamples,
		outputSchema: definition.outputSchema,
		...(resultAdapter
			? {
					toModelOutput: async ({ output, toolCallId }) => {
						const workspaceId = freshWorkspaceIds?.get(toolCallId);
						if (workspaceId) {
							const fileOutput = await createPendingPdfModelOutput({
								env: input.env,
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
				createWorkspaceAccessContext({
					operationId: context.invocationId,
					scopes: getWorkspaceToolScopes(definition.access),
					userId: thread.userId,
					workspaceId: thread.workspaceId,
				}),
			);

			if (freshWorkspaceIds && isPendingPdfFallbackInput(args)) {
				freshWorkspaceIds.set(context.invocationId, thread.workspaceId);
			}

			return output;
		},
	});
}

export function createAIThreadWorkspaceTools(input: {
	env: Cloudflare.Env;
	getThreadContext: () => Promise<AIThreadContext | null>;
}): ToolSet {
	return Object.fromEntries(
		workspaceToolDefinitions.map((definition) => [
			definition.name,
			createWorkspaceThreadTool({
				definition,
				env: input.env,
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
