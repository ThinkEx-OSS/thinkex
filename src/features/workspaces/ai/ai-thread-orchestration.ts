import { generateTypes } from "@cloudflare/codemode/ai";
import type { ConnectorTool, ConnectorTools } from "@cloudflare/codemode";
import { CodemodeConnector, sanitizeToolName } from "@cloudflare/codemode";
import { createExecuteRuntime } from "@cloudflare/think/tools/execute";
import type { StateBackend } from "@cloudflare/shell";
import type { ToolSet } from "ai";

import {
	aiThreadOrchestrationOutputSchema,
	normalizeAIThreadOrchestrationOutput,
} from "#/features/workspaces/ai/ai-thread-orchestration-contract";
import { requireAIThreadToolRuntime } from "#/features/workspaces/ai/ai-thread-tool";

export {
	getAIThreadOrchestrationTelemetryOutput,
	normalizeAIThreadOrchestrationOutput,
} from "#/features/workspaces/ai/ai-thread-orchestration-contract";
export type { AIThreadOrchestrationOutput } from "#/features/workspaces/ai/ai-thread-orchestration-contract";

interface CreateAIThreadOrchestrationToolInput {
	ctx: DurableObjectState;
	description: string;
	loader: WorkerLoader;
	name: string;
	state?: StateBackend;
	tools: ToolSet;
}

/**
 * Owns the seam between Cloudflare Code Mode and ThinkEx's AI SDK tools.
 * Cloudflare keeps its full durable execution log; callers receive only the
 * typed, compact application result below.
 */
export function createAIThreadOrchestrationTool(input: CreateAIThreadOrchestrationToolInput) {
	const runtime = createExecuteRuntime({
		ctx: input.ctx,
		loader: input.loader,
		state: input.state,
		connectors: [new AIThreadToolSetConnector(input.ctx, input.tools)],
		name: input.name,
		description: input.description,
	});
	const execute = runtime.tool.execute;

	if (!execute) {
		throw new Error("Code Mode orchestration tool is not executable");
	}

	return {
		...runtime.tool,
		outputSchema: aiThreadOrchestrationOutputSchema,
		execute: async (...args: Parameters<typeof execute>) => {
			return normalizeAIThreadOrchestrationOutput(await execute(...args));
		},
	};
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
						description: aiTool.description,
						inputSchema: await runtime.inputSchema.jsonSchema,
						outputSchema: await runtime.outputSchema.jsonSchema,
						...(aiTool.needsApproval !== undefined && aiTool.needsApproval !== false
							? { requiresApproval: true }
							: {}),
						execute: async (args, context) => {
							return runtime.execute(args, {
								codemodeExecutionId: context?.executionId,
								invocationId: crypto.randomUUID(),
								source: "codemode",
							});
						},
					};

					return [methodName, connectorTool];
				}),
			),
		);
	}

	async getTypeScriptTypes() {
		return generateTypes(this.#toolSet, this.name());
	}
}
