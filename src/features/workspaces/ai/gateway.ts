import type { LanguageModel, UIMessage } from "ai";
import {
	addToolInputExamplesMiddleware,
	createGateway,
	generateText,
	Output,
	wrapLanguageModel,
} from "ai";
import { z } from "zod";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import {
	getAIThreadTitleGatewayRoutingOptions,
	getWorkspaceAiGatewayRoutingOptions,
} from "#/features/workspaces/ai/ai-gateway-routing";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	getWorkspaceAiChatModel,
	type resolveWorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";

// Vercel AI Gateway model factory, transport tuning, and title generation.
// Extracted from the Think-era ai-thread-runtime.ts so the Postgres chat path
// has no framework dependencies; the comments carry over because the tuning
// rationale is unchanged.

const AI_THREAD_TITLE_GATEWAY_MODEL = "google/gemini-2.5-flash-lite";

type WorkspaceAiProviderOptions = NonNullable<
	Parameters<typeof generateText>[0]["providerOptions"]
>;

export function getWorkspaceAiLanguageModel(
	modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>,
	env: Cloudflare.Env,
	_sessionAffinity: string,
): LanguageModel {
	return getWorkspaceAiLanguageModelForGatewayModel(getWorkspaceAiChatModel(modelId), env);
}

function getWorkspaceAiLanguageModelForGatewayModel(
	gatewayModel: string,
	env: Cloudflare.Env,
): LanguageModel {
	const gateway = createGateway({
		apiKey: getVercelAiGatewayApiKey(env),
	});

	return wrapLanguageModel({
		model: gateway(gatewayModel),
		middleware: addToolInputExamplesMiddleware({
			prefix: "Valid input examples:",
		}),
	});
}

function getWorkspaceAiGatewayTransportOptions() {
	return {
		caching: "auto" as const,
		// Buy the fast lane where it exists. The gateway only forwards a tier to
		// OpenAI, Google AI Studio, and Vertex, so this is a no-op on the Claude
		// primaries and moves the models we actually default to (`auto`/luna, the
		// Gemini pair, the nano/flash-lite title legs). It is a hint, never a
		// promise: an unsupported model ignores it, and a provider that is out of
		// priority capacity silently downgrades to standard and bills standard.
		serviceTier: "priority" as const,
		// Time-to-first-token budget before a BYOK leg is abandoned for the next
		// provider. Sized per provider off measured p90/p99 TTFT of the slowest
		// model each one serves; reasoning happens before the first token.
		providerTimeouts: {
			byok: {
				anthropic: 20_000,
				azure: 15_000,
				openai: 15_000,
				vertex: 30_000,
			},
		},
	};
}

export function getWorkspaceAiGatewayProviderOptions(input?: {
	modelId?: ReturnType<typeof resolveWorkspaceAiChatModelId>;
	thread?: AIThreadContext;
	tags?: string[];
}): WorkspaceAiProviderOptions {
	const modelId = input?.modelId ?? DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID;
	const tags = [
		"app:thinkex",
		"feature:workspace-chat",
		`model:${modelId}`,
		input?.thread ? `workspace:${input.thread.workspaceId}` : undefined,
		input?.thread ? (input.thread.promptScope.canMutate ? "mode:mutate" : "mode:view") : undefined,
		...(input?.tags ?? []),
	].filter((tag): tag is string => Boolean(tag));

	return {
		gateway: {
			...getWorkspaceAiGatewayTransportOptions(),
			...getWorkspaceAiGatewayRoutingOptions(modelId),
			tags,
			...(input?.thread ? { user: input.thread.userId } : {}),
		},
		...getWorkspaceAiReasoningOptions(modelId),
	} satisfies WorkspaceAiProviderOptions;
}

function getWorkspaceAiReasoningOptions(
	modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>,
): WorkspaceAiProviderOptions {
	switch (modelId) {
		case "gemini":
			return {
				google: {
					thinkingConfig: { thinkingLevel: "low" },
				},
				vertex: {
					thinkingConfig: { thinkingLevel: "low" },
				},
			};
		case "gpt-terra":
			return {
				openai: {
					reasoningEffort: "none",
				},
			};
		default:
			return {};
	}
}

function getVercelAiGatewayApiKey(env: Cloudflare.Env) {
	const apiKey =
		(env as { AI_GATEWAY_API_KEY?: string }).AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY;

	if (!apiKey) {
		throw new Error("AI_GATEWAY_API_KEY is required to use Vercel AI Gateway.");
	}

	return apiKey;
}

export async function generateAIThreadTitle(input: { env: Cloudflare.Env; messages: UIMessage[] }) {
	const firstUserMessage = getFirstUserMessageText(input.messages);

	if (!firstUserMessage) {
		return undefined;
	}

	const result = await generateText({
		model: getWorkspaceAiLanguageModelForGatewayModel(AI_THREAD_TITLE_GATEWAY_MODEL, input.env),
		providerOptions: {
			gateway: {
				...getWorkspaceAiGatewayTransportOptions(),
				...getAIThreadTitleGatewayRoutingOptions(),
				tags: [
					"app:thinkex",
					"feature:workspace-chat",
					"task:title-generation",
					`model:${AI_THREAD_TITLE_GATEWAY_MODEL}`,
				],
			},
			// The 2.5-series title model rejects `thinkingLevel` outright, which
			// 400s every Google leg; budget is its knob. The fallback nano is a
			// reasoning model; a six-word title needs none of it.
			google: {
				thinkingConfig: { thinkingBudget: 0 },
			},
			vertex: {
				thinkingConfig: { thinkingBudget: 0 },
			},
			openai: {
				reasoningEffort: "none",
			},
		} as WorkspaceAiProviderOptions,
		instructions:
			"Produce a concise chat title for the user message. Two to six words. No quotes, no trailing punctuation.",
		prompt: firstUserMessage,
		output: Output.object({
			schema: AI_THREAD_TITLE_OUTPUT_SCHEMA,
			name: "chat_title",
			description: "A concise 2-6 word title summarizing the chat.",
		}),
	});

	return {
		title: result.output?.title,
		usage: result.totalUsage,
		providerMetadata: await Promise.resolve(result.providerMetadata).catch(() => undefined),
		gatewayModel: AI_THREAD_TITLE_GATEWAY_MODEL,
	};
}

const AI_THREAD_TITLE_OUTPUT_SCHEMA = z.object({
	title: z
		.string()
		.trim()
		.min(1)
		.max(80)
		.describe("Two to six word chat title. No quotes, no trailing punctuation."),
});

function getFirstUserMessageText(messages: UIMessage[]) {
	const firstUserMessage = messages.find((message) => message.role === "user");

	if (!firstUserMessage) {
		return "";
	}

	return firstUserMessage.parts
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n")
		.trim()
		.slice(0, 1000);
}
