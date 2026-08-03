import { env } from "cloudflare:test";
import { asSchema, generateText, stepCountIs, tool, type ToolSet } from "ai";
import type { z } from "zod";

import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import {
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiLanguageModel,
} from "#/features/workspaces/ai/ai-thread-runtime";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	resolveWorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import {
	getWorkspaceToolDefinition,
	workspaceToolDefinitions,
} from "#/features/workspaces/operations/workspace-tool-definitions";

/** A single tool call the model emitted, graded against the real zod schema. */
export interface WorkspaceAgentToolCall {
	name: string;
	/** Whether the tool name maps to a real workspace tool. */
	known: boolean;
	input: unknown;
	/** `input` satisfies the tool's real zod input schema. */
	valid: boolean;
	/** Human-readable zod issues (`path: message`) when invalid. */
	issues: string[];
}

/** Normalized, JSON-safe result of one agent turn — the harness `output`. */
export interface WorkspaceAgentOutput {
	text: string;
	finishReason: string;
	toolCalls: WorkspaceAgentToolCall[];
	[key: string]: unknown;
}

export interface WorkspaceAgentInput {
	prompt: string;
	/** Friendly model id from `models.ts` (e.g. "claude-sonnet"). Defaults to "auto". */
	modelId?: string;
	/** Extra system text appended to the soul prompt (e.g. a workspace scope block). */
	system?: string;
}

// Real workspace tools, but with stubbed execution. Evals grade tool *selection*
// and *argument validity* — the two things schema/instruction changes move — so we
// never touch a Durable Object or mutate a real workspace.
function buildEvalToolSet(): ToolSet {
	return Object.fromEntries(
		workspaceToolDefinitions.map((definition) => [
			definition.name,
			tool({
				description: definition.description,
				// Heterogeneous across tools; the eval only needs the schema rendered
				// to the model, so widen past the per-tool union.
				inputSchema: asSchema(definition.inputSchema as z.ZodTypeAny),
				// Neutral stub so a follow-up step (e.g. read → edit) can still proceed.
				execute: async () => ({ ok: true, note: "eval stub — no real mutation" }),
			}),
		]),
	) as ToolSet;
}

const EVAL_TOOL_SET = buildEvalToolSet();

/**
 * Run one workspace-agent turn against a real model and return a normalized,
 * gradeable result. Invalid tool calls are captured (the AI SDK surfaces them as
 * content parts rather than throwing), then re-validated against the real schema.
 */
export async function runWorkspaceAgent(input: WorkspaceAgentInput): Promise<WorkspaceAgentOutput> {
	const modelId = resolveWorkspaceAiChatModelId(
		input.modelId ?? DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	);
	const system = input.system
		? `${getAIThreadSoulPrompt()}\n\n${input.system}`
		: getAIThreadSoulPrompt();

	const result = await generateText({
		model: getWorkspaceAiLanguageModel(modelId, env, "eval"),
		providerOptions: getWorkspaceAiGatewayProviderOptions({ modelId }),
		system,
		prompt: input.prompt,
		tools: EVAL_TOOL_SET,
		// A couple of steps so read→write flows can happen; kept small and cheap.
		stopWhen: stepCountIs(3),
	});

	const toolCalls: WorkspaceAgentToolCall[] = [];
	for (const step of result.steps) {
		for (const part of step.content) {
			if (part.type !== "tool-call") continue;
			const definition = getWorkspaceToolDefinition(part.toolName);
			const parsed = definition ? definition.inputSchema.safeParse(part.input) : null;
			toolCalls.push({
				name: part.toolName,
				known: Boolean(definition),
				input: part.input,
				valid: parsed ? parsed.success : false,
				issues: parsed
					? parsed.success
						? []
						: parsed.error.issues.map(
								(issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
							)
					: ["unknown tool"],
			});
		}
	}

	return { text: result.text, finishReason: result.finishReason, toolCalls };
}
