import type { ConnectorTool, ConnectorTools } from "@cloudflare/codemode";
import { CodemodeConnector, sanitizeToolName } from "@cloudflare/codemode";
import { createExecuteRuntime } from "@cloudflare/think/tools/execute";
import type { StateBackend } from "@cloudflare/shell";
import type { Tool, ToolSet } from "ai";
import { z } from "zod";

import { generateAIThreadCodemodeTypes } from "#/features/workspaces/ai/ai-codemode-types";
import {
	getAIThreadOrchestrationModelOutput,
	normalizeAIThreadOrchestrationOutput,
} from "#/features/workspaces/ai/ai-thread-orchestration-contract";
import {
	aiThreadActivityTitleSchema,
	getModelToolDefinition,
	requireAIThreadToolRuntime,
} from "#/features/workspaces/ai/ai-thread-tool";
import { attachDocumentEditReceiptMetadata } from "#/features/workspaces/ai/ai-thread-tool-ui-metadata";

type AIThreadOrchestrationRuntime = ReturnType<typeof createExecuteRuntime>["runtime"];

/**
 * Code Mode's own input schema is `{ code }` alone, which leaves the chat row
 * with nothing to say but "Working". Widening it with a leading `title` costs
 * the execution nothing — Cloudflare's executor destructures `code` and
 * ignores the rest — and gives the row a model-authored label to show while
 * the code streams in.
 */
const aiThreadOrchestrationInputSchema = z.object({
	title: aiThreadActivityTitleSchema,
	code: z.string(),
});

export {
	getAIThreadOrchestrationTelemetryOutput,
	getAIThreadOrchestrationModelOutput,
	normalizeAIThreadOrchestrationOutput,
} from "#/features/workspaces/ai/ai-thread-orchestration-contract";
export type { AIThreadOrchestrationOutput } from "#/features/workspaces/ai/ai-thread-orchestration-contract";

interface CreateAIThreadOrchestrationToolInput {
	ctx: DurableObjectState;
	description: string;
	loader: WorkerLoader;
	name: string;
	onRuntime?: (runtime: AIThreadOrchestrationRuntime) => void;
	state?: StateBackend;
	tools: ToolSet;
}

/**
 * Owns the seam between Cloudflare Code Mode and ThinkEx's AI SDK tools.
 * Cloudflare keeps its full durable execution log; callers receive only the
 * typed, compact application result below.
 */
export function createAIThreadOrchestrationTool(input: CreateAIThreadOrchestrationToolInput): Tool {
	const runtime = createExecuteRuntime({
		ctx: input.ctx,
		loader: input.loader,
		state: input.state,
		connectors: [new AIThreadToolSetConnector(input.ctx, input.tools)],
		name: input.name,
		description: input.description,
	});
	input.onRuntime?.(runtime.runtime);
	const execute = runtime.tool.execute;

	if (!execute) {
		throw new Error("Code Mode orchestration tool is not executable");
	}

	return {
		...getModelToolDefinition(runtime.tool),
		inputSchema: aiThreadOrchestrationInputSchema,
		toModelOutput: ({ output }) => ({
			type: "json" as const,
			value: getAIThreadOrchestrationModelOutput(output),
		}),
		execute: async (...args: Parameters<typeof execute>) => {
			return normalizeAIThreadOrchestrationOutput(await execute(...args));
		},
	} as Tool;
}

class AIThreadToolSetConnector extends CodemodeConnector {
	readonly #toolSet: ToolSet;

	constructor(ctx: DurableObjectState, toolSet: ToolSet) {
		super(ctx, {});
		this.#toolSet = toolSet;
	}

	name() {
		return "tools";
	}

	protected async tools(): Promise<ConnectorTools> {
		const sources = new Map<string, string>();

		return Object.fromEntries(
			await Promise.all(
				Object.entries(this.#toolSet).map(async ([toolName, aiTool]) => {
					const runtime = requireAIThreadToolRuntime(toolName, aiTool);
					const methodName = sanitizeToolName(toolName);
					const existing = sources.get(methodName);
					if (existing) {
						throw new Error(
							`Code Mode tools "${existing}" and "${toolName}" both map to "${methodName}"`,
						);
					}
					sources.set(methodName, toolName);

					const connectorTool: ConnectorTool = {
						description: typeof aiTool.description === "function" ? undefined : aiTool.description,
						inputSchema: await runtime.inputSchema.jsonSchema,
						outputSchema: await runtime.outputSchema.jsonSchema,
						// No tool sets `needsApproval` today, so nothing arms this and a run
						// can never come back `paused` — Code Mode pauses only to await an
						// approval. The pause handling downstream is kept as the landing
						// pad for the next tool that does want a gate.
						...(aiTool.needsApproval !== undefined && aiTool.needsApproval !== false
							? { requiresApproval: true }
							: {}),
						execute: async (args, context) => {
							const invocationId = crypto.randomUUID();
							const output = await runtime.execute(args, {
								codemodeExecutionId: context?.executionId,
								invocationId,
								source: "codemode",
							});

							return toolName === "workspace_edit_item"
								? attachDocumentEditReceiptMetadata(output, invocationId)
								: output;
						},
					};

					return [methodName, connectorTool];
				}),
			),
		);
	}

	async getTypeScriptTypes() {
		return generateAIThreadCodemodeTypes(this.#toolSet, this.name());
	}
}
