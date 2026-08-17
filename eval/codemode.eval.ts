import { env } from "cloudflare:test";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineAIThreadTool } from "#/features/workspaces/ai/ai-thread-tool";
import type {
	AiCodemodeActivityEvent,
	AiCodemodeOutput,
} from "#/features/workspaces/ai/codemode-tool";
import { createAiChatCodemodeTool } from "#/features/workspaces/ai/codemode-tool";
import {
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiLanguageModel,
} from "#/features/workspaces/ai/gateway";
import { resolveWorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

// Deterministic fixture: per-topic averages are algebra 66, geometry 90,
// calculus 58, statistics 92; overall average 76.5; weakest topic calculus.
const QUIZ_SCORES = [
	{ topic: "algebra", score: 62 },
	{ topic: "algebra", score: 70 },
	{ topic: "geometry", score: 88 },
	{ topic: "geometry", score: 92 },
	{ topic: "calculus", score: 55 },
	{ topic: "calculus", score: 61 },
	{ topic: "statistics", score: 90 },
	{ topic: "statistics", score: 94 },
];

function createQuizScoresTool() {
	return defineAIThreadTool({
		description: "List the user's quiz results (topic and score out of 100).",
		inputSchema: z.object({}),
		outputSchema: z.object({
			scores: z.array(z.object({ topic: z.string(), score: z.number() })),
		}),
		execute: () => ({ scores: QUIZ_SCORES }),
	});
}

async function runOrchestrateTurn(prompt: string) {
	const events: AiCodemodeActivityEvent[] = [];
	const innerTools: ToolSet = { get_quiz_scores: createQuizScoresTool() };
	const tools: ToolSet = {
		...innerTools,
		orchestrate: createAiChatCodemodeTool({
			env,
			tools: innerTools,
			onActivity: (event) => events.push(event),
		}),
	};
	const modelId = resolveWorkspaceAiChatModelId(undefined);

	const result = await generateText({
		model: getWorkspaceAiLanguageModel(modelId, env, "eval-codemode"),
		providerOptions: getWorkspaceAiGatewayProviderOptions({ modelId }),
		system:
			"You are the assistant inside the Study workspace of a learning app. Ground answers in tool results.",
		prompt,
		tools,
		stopWhen: stepCountIs(4),
	});

	const orchestrateRuns: Array<{ input: unknown; output: AiCodemodeOutput }> = [];
	for (const step of result.steps) {
		for (const part of step.content) {
			if (part.type === "tool-result" && part.toolName === "orchestrate") {
				orchestrateRuns.push({
					input: part.input,
					// SAFETY: orchestrate's execute returns AiCodemodeOutput by
					// construction; the eval only reads it for grading.
					output: part.output as AiCodemodeOutput,
				});
			}
		}
	}

	return { text: result.text, orchestrateRuns, events };
}

// Live evals: real model turns through the real gateway and a real dynamic
// worker isolate. Billed and slow, so they run via `pnpm eval` only.
describe.skipIf(!process.env.AI_GATEWAY_API_KEY)("orchestrate (code mode)", () => {
	it("computes exact arithmetic through generated code", async () => {
		const run = await runOrchestrateTurn(
			"Compute exactly: 48271 × 3917. I need the precise number, no estimation.",
		);
		console.log("[arithmetic] text:", run.text);
		console.log("[arithmetic] runs:", JSON.stringify(run.orchestrateRuns, null, 2));

		expect(run.orchestrateRuns.length).toBeGreaterThanOrEqual(1);
		const output = run.orchestrateRuns[0]!.output;
		expect(output.status).toBe("completed");
		expect(run.text.replace(/[,\s.]/g, "")).toContain("189077507");
	});

	it("aggregates tool data inside one orchestrate run", async () => {
		const run = await runOrchestrateTurn(
			"Using my quiz scores, compute my overall average score and identify my weakest topic by average. Compute, don't estimate.",
		);
		console.log("[aggregation] text:", run.text);
		console.log("[aggregation] runs:", JSON.stringify(run.orchestrateRuns, null, 2));
		console.log("[aggregation] events:", JSON.stringify(run.events));

		expect(run.orchestrateRuns.length).toBeGreaterThanOrEqual(1);
		const output = run.orchestrateRuns[0]!.output;
		expect(output.status).toBe("completed");
		expect(output.calls.some((call) => call.toolName === "get_quiz_scores")).toBe(true);
		expect(run.text).toContain("76.5");
		expect(run.text.toLowerCase()).toContain("calculus");
	}, 180_000);
});
