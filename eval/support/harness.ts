import { env } from "cloudflare:test";
import { asSchema, generateText, stepCountIs, tool, type ToolSet } from "ai";
import type { z } from "zod";

import { getAIThreadSoulPrompt } from "#/features/workspaces/ai/ai-thread-soul-prompt";
import { createProviderCompatibleInputSchema } from "#/features/workspaces/ai/ai-thread-tool";
import {
	getAIThreadSystemPromptForWorkspace,
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
import {
	createDocumentAiBlockSnapshot,
	parseDocumentAiHtml,
	serializeTiptapNodeToAiHtml,
	withTiptapNodeAiRef,
} from "#/features/workspaces/documents/document-ai-html";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

/** A single tool call the model emitted, graded against the real zod schema. */
export interface WorkspaceAgentToolCall {
	name: string;
	input: unknown;
	/** editRefs returned by completed read steps before this call, grouped by source path. */
	priorReadEditRefsByPath: Record<string, string[]>;
	/** `input` satisfies the tool's real zod input schema. */
	valid: boolean;
	/** Human-readable zod issues (`path: message`) when invalid. */
	issues: string[];
}

/** Normalized, JSON-safe result of one agent turn — the harness `output`. */
export interface WorkspaceAgentOutput {
	text: string;
	toolCalls: WorkspaceAgentToolCall[];
}

export interface WorkspaceAgentInput {
	prompt: string;
	/** Friendly model id from `models.ts` (e.g. "claude-sonnet"). Defaults to "auto". */
	modelId?: string;
	/** Whether the turn may mutate; drives the real runtime scope block. */
	canMutate?: boolean;
	timeZone?: string;
	workspaceName?: string;
}

const STANDUP_PATH = "/Notes/Standup.md";

type EvalStandupFixture = {
	blocks: Map<string, string>;
	content: string;
};

let evalStandupFixture: Promise<EvalStandupFixture> | undefined;

function getEvalStandupFixture() {
	return (evalStandupFixture ??= createEvalStandupFixture());
}

/** Derive the eval read fixture from the production serializers so it cannot drift. */
async function createEvalStandupFixture(): Promise<EvalStandupFixture> {
	const document = getTiptapDocumentSchema().nodeFromJSON(
		parseDocumentAiHtml("<h1>Standup</h1><ul><li>Discuss roadmap</li></ul>"),
	);
	const blockIds = ["b_standupHead1", "b_standupList1"];
	const blocks = new Map<string, string>();
	const content: string[] = [];

	for (let index = 0; index < document.childCount; index += 1) {
		const blockId = blockIds[index];
		if (!blockId) throw new Error("Eval standup fixture has an unexpected block count.");
		const node = withTiptapNodeAiRef(document.child(index), blockId);
		const snapshot = await createDocumentAiBlockSnapshot(node);
		blocks.set(snapshot.editRef, snapshot.content);
		content.push(await serializeTiptapNodeToAiHtml(node));
	}

	return { blocks, content: content.join("") };
}

// Per-tool stubbed outputs. Reads return the realistic item for the requested
// path; everything else returns a neutral success so a follow-up step can still
// proceed. No real Durable Object is touched and no workspace is mutated.
async function evalToolFixture(toolName: string, input: unknown): Promise<unknown> {
	if (toolName === "workspace_read_items") {
		const fixture = await getEvalStandupFixture();
		const requests = (
			input as {
				requests?: Array<{ editRef?: string; mode?: string; path?: string }>;
			}
		)?.requests;
		const results = (requests ?? []).map((request) => {
			if (request.path !== STANDUP_PATH) {
				return { code: "path_not_found", path: request.path ?? "", status: "failed" };
			}
			if (request.mode === "block") {
				const editRef = request.editRef ?? "";
				const content = fixture.blocks.get(editRef);
				if (!content) {
					return { code: "edit_ref_not_found", path: STANDUP_PATH, status: "failed" };
				}

				return {
					content,
					editRef,
					format: "html",
					itemId: "standup-document",
					path: STANDUP_PATH,
					status: "ready",
					type: "block",
				};
			}
			if (request.mode !== "start") {
				return { code: "invalid_selection", path: STANDUP_PATH, status: "failed" };
			}

			return {
				content: fixture.content,
				format: "html",
				itemId: "standup-document",
				location: { endBlock: 2, kind: "blocks", startBlock: 1, totalBlocks: 2 },
				path: STANDUP_PATH,
				status: "ready",
				type: "document",
			};
		});

		return { references: [], results };
	}
	return { ok: true, note: "eval stub — no real mutation" };
}

// Real workspace tools with stubbed execution. Evals grade tool *selection* and
// *argument validity*, so the model must see the SAME surface production sends:
// the provider-compatible schema (maxItems stripped, which Anthropic requires) via
// the shared `createProviderCompatibleInputSchema`, plus the `inputExamples` the
// gateway middleware injects. Only execution is stubbed.
function buildEvalToolSet(canMutate: boolean): ToolSet {
	return Object.fromEntries(
		workspaceToolDefinitions
			.filter((definition) => canMutate || definition.access === "read")
			.map((definition) => [
				definition.name,
				tool({
					description: definition.description,
					inputSchema: createProviderCompatibleInputSchema(
						asSchema(definition.inputSchema as z.ZodTypeAny),
					),
					inputExamples: definition.inputExamples,
					execute: async (input: unknown) => evalToolFixture(definition.name, input),
				}),
			]),
	) as ToolSet;
}

/**
 * Run one workspace-agent turn against a real model and return a normalized,
 * gradeable result. Invalid tool calls are captured (the AI SDK surfaces them as
 * content parts rather than throwing), then re-validated against the real schema.
 */
export async function runWorkspaceAgent(input: WorkspaceAgentInput): Promise<WorkspaceAgentOutput> {
	const canMutate = input.canMutate ?? true;
	const modelId = resolveWorkspaceAiChatModelId(
		input.modelId ?? DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	);
	// Production-identical system text: the soul prompt, the workspace citation
	// rules, and the runtime scope block that `beforeTurn` injects. Grading a
	// model against a thinner prompt than production ships would measure the
	// harness, not the product.
	const workspacePrompt = getAIThreadSystemPromptForWorkspace(
		getAIThreadSoulPrompt(),
		{ canMutate, workspaceName: input.workspaceName ?? "Study" },
		{ timeZone: input.timeZone ?? "America/New_York" },
	);

	const result = await generateText({
		model: getWorkspaceAiLanguageModel(modelId, env, "eval"),
		providerOptions: getWorkspaceAiGatewayProviderOptions({ modelId }),
		system: workspacePrompt,
		prompt: input.prompt,
		tools: buildEvalToolSet(canMutate),
		// A couple of steps so read→write flows can happen; kept small and cheap.
		stopWhen: stepCountIs(3),
	});

	const toolCalls: WorkspaceAgentToolCall[] = [];
	const priorReadEditRefsByPath = new Map<string, Set<string>>();
	for (const step of result.steps) {
		for (const part of step.content) {
			if (part.type !== "tool-call") continue;
			const definition = getWorkspaceToolDefinition(part.toolName);
			const parsed = definition ? definition.inputSchema.safeParse(part.input) : null;
			toolCalls.push({
				name: part.toolName,
				input: part.input,
				priorReadEditRefsByPath: Object.fromEntries(
					[...priorReadEditRefsByPath].map(([path, refs]) => [path, [...refs]]),
				),
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
		for (const toolResult of step.toolResults) {
			if (toolResult.toolName === "workspace_read_items") {
				collectReadEditRefs(toolResult.output, priorReadEditRefsByPath);
			}
		}
	}

	return { text: result.text, toolCalls };
}

function collectReadEditRefs(output: unknown, refsByPath: Map<string, Set<string>>) {
	const results = (output as { results?: unknown[] })?.results;
	if (!Array.isArray(results)) {
		return;
	}

	for (const result of results) {
		if (!result || typeof result !== "object") {
			continue;
		}

		const { content, editRef, path } = result as {
			content?: unknown;
			editRef?: unknown;
			path?: unknown;
		};
		if (typeof path !== "string") {
			continue;
		}
		let refs = refsByPath.get(path);
		if (!refs) {
			refs = new Set<string>();
			refsByPath.set(path, refs);
		}
		if (typeof editRef === "string") {
			refs.add(editRef);
		}
		if (typeof content === "string") {
			for (const match of content.matchAll(/data-edit-ref="([^"]+)"/g)) {
				if (match[1]) {
					refs.add(match[1]);
				}
			}
		}
	}
}
