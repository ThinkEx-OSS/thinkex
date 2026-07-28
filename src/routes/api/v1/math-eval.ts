import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { generateText, streamText } from "ai";
import { z } from "zod";

import {
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiLanguageModel,
} from "#/features/workspaces/ai/ai-thread-runtime";
import { resolveWorkspaceAiChatModelId } from "#/features/workspaces/ai/models";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const bodySchema = z.object({
	modelId: z.string(),
	systemPrompt: z.string(),
	userPrompt: z.string().optional(),
	messages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string(),
			}),
		)
		.optional(),
});

// Lightweight lexical analysis of a model's raw output so we can classify
// which math delimiter dialect each model actually emits without a browser.
function analyzeMathDialects(text: string) {
	const escapedInline = (text.match(/\\\([\s\S]+?\\\)/g) ?? []).length;
	const escapedBlock = (text.match(/\\\[[\s\S]+?\\\]/g) ?? []).length;
	// Detect $...$ and $$...$$ heuristically. We split on $$ first, then any
	// remaining single $ that has math-y content between pairs.
	const doubleDollarBlocks = (text.match(/\$\$[\s\S]+?\$\$/g) ?? []).length;
	const withoutDoubles = text.replace(/\$\$[\s\S]+?\$\$/g, "");
	const singleDollarPairs = (withoutDoubles.match(/\$[^$\n]+?\$/g) ?? []).length;
	// Unescaped currency-looking dollars (e.g. "$5", "$100/mo").
	const rawCurrency = (text.match(/(?<!\\)\$\d/g) ?? []).length;
	// Fenced ```math blocks.
	const fencedMath = (text.match(/```math\s+[\s\S]+?```/g) ?? []).length;
	// Unicode math operators frequently emitted instead of LaTeX.
	const unicodeMath = (text.match(/[×÷≠≤≥∈∉∀∃∑∏∫√∞∂∇]/g) ?? []).length;
	return {
		escapedInline, // \(...\)
		escapedBlock, // \[...\]
		singleDollarPairs, // $x$
		doubleDollarBlocks, // $$x$$
		fencedMath, // ```math
		unicodeMath,
		rawCurrency,
	};
}

function isDevLocalhostRequest(request: Request) {
	if (process.env.NODE_ENV !== "development") return false;
	const url = new URL(request.url);
	if (!["localhost", "127.0.0.1"].includes(url.hostname)) return false;
	return request.headers.get("x-eval-dev") === "1";
}

async function handleMathEval(request: Request) {
	const requestId = getRequestId(request);

	if (!isDevLocalhostRequest(request)) {
		const session = await getSessionFromRequest(request);
		if (!session) {
			return apiError(requestId, 401, "UNAUTHORIZED", "Sign in to use the math eval harness.");
		}
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return apiError(requestId, 400, "BAD_REQUEST", "Request body must be valid JSON.");
	}

	const parsed = bodySchema.safeParse(body);
	if (!parsed.success) {
		return apiError(requestId, 400, "BAD_REQUEST", "Invalid request body.");
	}

	const modelId = resolveWorkspaceAiChatModelId(parsed.data.modelId);
	const model = getWorkspaceAiLanguageModel(modelId, env, "math-eval");
	const providerOptions = getWorkspaceAiGatewayProviderOptions({ modelId });

	const url = new URL(request.url);
	const wantsJson = url.searchParams.get("json") === "1";

	const promptOrMessages = parsed.data.messages
		? { messages: parsed.data.messages }
		: { prompt: parsed.data.userPrompt ?? "" };

	if (wantsJson) {
		const start = Date.now();
		const result = await generateText({
			model,
			providerOptions,
			system: parsed.data.systemPrompt,
			...promptOrMessages,
		});
		const latencyMs = Date.now() - start;
		return apiJson(
			{
				text: result.text,
				latencyMs,
				analysis: analyzeMathDialects(result.text),
				usage: result.usage,
			},
			requestId,
		);
	}

	const result = streamText({
		model,
		providerOptions,
		system: parsed.data.systemPrompt,
		...promptOrMessages,
	});

	return result.toTextStreamResponse();
}

export const Route = createFileRoute("/api/v1/math-eval")({
	server: {
		handlers: {
			POST: ({ request }) => handleMathEval(request),
		},
	},
});
