import { env } from "cloudflare:test";
import { Output, generateText } from "ai";
import { z } from "zod";

import {
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiLanguageModel,
} from "#/features/workspaces/ai/ai-thread-runtime";
import { resolveWorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

import type { WorkspaceAgentOutput } from "./harness";

export interface ScoreResult {
	score: number; // 0..1
	pass: boolean;
	message: string;
}

/** Every tool call the model made carries valid arguments per its real zod schema. */
export function scoreToolInputsValid(output: WorkspaceAgentOutput): ScoreResult {
	const invalid = output.toolCalls.filter((call) => !call.valid);
	const pass = invalid.length === 0;
	return {
		score: output.toolCalls.length === 0 ? 1 : 1 - invalid.length / output.toolCalls.length,
		pass,
		message: pass
			? "all tool inputs valid"
			: invalid.map((call) => `${call.name}: ${call.issues.join("; ") || "invalid"}`).join(" | "),
	};
}

/** Model called every expected tool at least once (order-independent). */
export function scoreExpectedTools(
	output: WorkspaceAgentOutput,
	expectedTools: string[],
): ScoreResult {
	const called = new Set(output.toolCalls.map((call) => call.name));
	const missing = expectedTools.filter((name) => !called.has(name));
	const pass = missing.length === 0;
	return {
		score: expectedTools.length === 0 ? 1 : 1 - missing.length / expectedTools.length,
		pass,
		message: pass
			? `called: [${[...called].join(", ")}]`
			: `missing: [${missing.join(", ")}] — called: [${[...called].join(", ") || "none"}]`,
	};
}

/** Model called none of the forbidden tools (e.g. no writes on a read-only turn). */
export function scoreNoForbiddenTools(
	output: WorkspaceAgentOutput,
	forbiddenTools: string[],
): ScoreResult {
	const forbidden = new Set(forbiddenTools);
	const hits: string[] = [];
	for (const call of output.toolCalls) {
		if (forbidden.has(call.name)) hits.push(call.name);
	}
	const pass = hits.length === 0;
	return {
		score: pass ? 1 : 0,
		pass,
		message: pass ? "no forbidden tools called" : `forbidden tools called: [${hits.join(", ")}]`,
	};
}

/**
 * For a read→edit turn: the model must submit a *targeted* edit (replace / insert /
 * delete) whose `ref` came from the read fixture — not a fabricated ref, and not a
 * whole-document `replace_all`. Without this, a hollow read stub plus the permissive
 * `ref` schema (any nonempty string) let a hallucinated target score a false pass.
 */
export function scoreTargetedEditProvenance(
	output: WorkspaceAgentOutput,
	validRefs: string[],
): ScoreResult {
	const refs = new Set(validRefs);
	const edits = output.toolCalls
		.filter((call) => call.name === "workspace_edit_item")
		.flatMap((call) => {
			const input = call.input as { edits?: Array<{ op?: string; ref?: string }> };
			return Array.isArray(input.edits) ? input.edits : [];
		});
	const isValidRef = (edit: { ref?: string }) => typeof edit.ref === "string" && refs.has(edit.ref);
	const targeted = edits.filter((edit) => edit.op !== "replace_all" && isValidRef(edit));
	const fabricated = edits.filter((edit) => edit.op !== "replace_all" && !isValidRef(edit));
	const usedReplaceAll = edits.some((edit) => edit.op === "replace_all");
	const pass = targeted.length > 0 && fabricated.length === 0 && !usedReplaceAll;

	const reasons: string[] = [];
	if (targeted.length === 0) reasons.push("no targeted edit used a ref from the read");
	if (fabricated.length > 0)
		reasons.push(`fabricated ref(s): ${fabricated.map((e) => e.ref ?? "<none>").join(", ")}`);
	if (usedReplaceAll) reasons.push("used replace_all instead of a targeted edit");
	return {
		score: pass ? 1 : 0,
		pass,
		message: pass ? "targeted edit used a ref from the read fixture" : reasons.join("; "),
	};
}

const QUALITY_VERDICT_SCHEMA = z.object({
	pass: z.boolean(),
	score: z.number().min(0).max(1),
	reasoning: z.string(),
});

// A cheap, low-variance model to grade natural-language answers against a rubric.
const JUDGE_MODEL_ID = resolveWorkspaceAiChatModelId("claude-haiku");

/**
 * LLM-as-judge: grade a free-text answer against a rubric. Deterministic checks
 * (schema/tool choice above) can't judge prose — this can, at the cost of a call.
 */
export async function scoreAnswerQuality(args: {
	prompt: string;
	answer: string;
	rubric: string;
}): Promise<ScoreResult> {
	const result = await generateText({
		model: getWorkspaceAiLanguageModel(JUDGE_MODEL_ID, env, "eval-judge"),
		providerOptions: getWorkspaceAiGatewayProviderOptions({ modelId: JUDGE_MODEL_ID }),
		output: Output.object({ schema: QUALITY_VERDICT_SCHEMA }),
		system:
			"You are a strict grader. Score how well the ASSISTANT ANSWER satisfies the RUBRIC for the given USER PROMPT. Return pass=false unless the rubric is clearly met. score is 0..1.",
		prompt: `USER PROMPT:\n${args.prompt}\n\nASSISTANT ANSWER:\n${args.answer}\n\nRUBRIC:\n${args.rubric}`,
	});

	const verdict = result.output;
	return {
		score: verdict?.score ?? 0,
		pass: verdict?.pass ?? false,
		message: verdict?.reasoning ?? "no verdict returned",
	};
}
