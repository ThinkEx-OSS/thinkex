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
 * delete) whose `editRef` came from a completed earlier read, not a fabricated
 * target or a whole-document `overwrite`.
 */
export function scoreTargetedEditProvenance(output: WorkspaceAgentOutput): ScoreResult {
	let targeted = 0;
	const fabricated: string[] = [];
	let usedOverwrite = false;

	for (const call of output.toolCalls) {
		if (call.name !== "workspace_edit_item") continue;
		const input = call.input as { edits?: Array<{ editRef?: string; op?: string }> };
		if (!Array.isArray(input.edits)) continue;

		const priorReadEditRefs = new Set(call.priorReadEditRefs);
		for (const edit of input.edits) {
			if (edit.op === "overwrite") {
				usedOverwrite = true;
			} else if (typeof edit.editRef === "string" && priorReadEditRefs.has(edit.editRef)) {
				targeted += 1;
			} else {
				fabricated.push(edit.editRef ?? "<none>");
			}
		}
	}
	const pass = targeted > 0 && fabricated.length === 0 && !usedOverwrite;

	const reasons: string[] = [];
	if (targeted === 0) reasons.push("no targeted edit used an editRef from the read");
	if (fabricated.length > 0) reasons.push(`fabricated editRef(s): ${fabricated.join(", ")}`);
	if (usedOverwrite) reasons.push("used overwrite instead of a targeted edit");
	return {
		score: pass ? 1 : 0,
		pass,
		message: pass ? "targeted edit used an editRef from a prior read" : reasons.join("; "),
	};
}

/**
 * What the model actually *wrote* — the final answer, or the arguments it passed
 * to a tool. Tool choice and schema validity say nothing about authoring dialect:
 * `$x^2$` inside document HTML is schema-valid and renders as literal dollar
 * signs forever, so only a content check can catch it.
 */
export interface ContentCheck {
	/** `"text"` grades the final answer; `{ tool }` grades that tool's inputs. */
	source: "text" | { tool: string };
	mustMatch?: Array<{ label: string; pattern: RegExp }>;
	mustNotMatch?: Array<{ label: string; pattern: RegExp }>;
}

/**
 * Every string the model wrote inside a tool argument, unescaped. Matching
 * against `JSON.stringify(input)` instead would compare patterns like
 * `data-type="inline-math"` against the escaped `data-type=\"inline-math\"` and
 * silently never match — a false failure that looks exactly like a real one.
 */
function collectStrings(value: unknown, out: string[] = []): string[] {
	if (typeof value === "string") {
		out.push(value);
	} else if (Array.isArray(value)) {
		for (const item of value) collectStrings(item, out);
	} else if (value && typeof value === "object") {
		for (const item of Object.values(value)) collectStrings(item, out);
	}
	return out;
}

export function scoreContent(output: WorkspaceAgentOutput, check: ContentCheck): ScoreResult {
	const source = check.source;
	const strings: string[] = [];
	if (typeof source !== "string") {
		for (const call of output.toolCalls) {
			if (call.name === source.tool) collectStrings(call.input, strings);
		}
	}
	const subject = typeof source === "string" ? output.text : strings.join("\n");

	if (!subject.trim()) {
		const label = typeof check.source === "string" ? "final answer" : `${check.source.tool} input`;
		return { score: 0, pass: false, message: `no ${label} to grade` };
	}

	const missing = (check.mustMatch ?? []).filter((rule) => !rule.pattern.test(subject));
	const present = (check.mustNotMatch ?? []).filter((rule) => rule.pattern.test(subject));
	const total = (check.mustMatch?.length ?? 0) + (check.mustNotMatch?.length ?? 0);
	const failures = missing.length + present.length;
	const reasons = [
		...missing.map((rule) => `missing ${rule.label}`),
		...present.map((rule) => `must not contain ${rule.label}`),
	];

	// Include what was actually written on failure — a dialect miss is only
	// actionable if you can see the markup the model chose instead.
	const excerpt = subject.length > 600 ? `${subject.slice(0, 600)}…` : subject;

	return {
		score: total === 0 ? 1 : 1 - failures / total,
		pass: failures === 0,
		message:
			failures === 0
				? "content matched every rule"
				: `${reasons.join("; ")}\n--- wrote: ${excerpt}`,
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
