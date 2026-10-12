import type { LanguageModel, UIMessage } from "ai";
import { addToolInputExamplesMiddleware, createGateway, generateText, wrapLanguageModel } from "ai";

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

export const AI_THREAD_TITLE_GATEWAY_MODEL = "google/gemini-3.5-flash-lite";

type WorkspaceAiProviderOptions = NonNullable<
	Parameters<typeof generateText>[0]["providerOptions"]
>;

/** Which job, conversation and user a model call belongs to, as Rudimint records it. */
export type RudimintCapture = {
	task: string;
	session?: string;
	user?: string;
	metadata?: Record<string, string | undefined>;
};

export function getWorkspaceAiLanguageModel(
	modelId: ReturnType<typeof resolveWorkspaceAiChatModelId>,
	env: Cloudflare.Env,
	capture?: RudimintCapture,
): LanguageModel {
	return getWorkspaceAiLanguageModelForGatewayModel(getWorkspaceAiChatModel(modelId), env, capture);
}

export function getWorkspaceAiLanguageModelForGatewayModel(
	gatewayModel: string,
	env: Cloudflare.Env,
	capture?: RudimintCapture,
): LanguageModel {
	const gateway = createGateway({
		apiKey: getVercelAiGatewayApiKey(env),
		...getRudimintGatewaySettings(env, capture),
	});

	return wrapLanguageModel({
		model: gateway(gatewayModel),
		middleware: addToolInputExamplesMiddleware({
			prefix: "Valid input examples:",
		}),
	});
}

export function getWorkspaceAiGatewayTransportOptions() {
	return {
		caching: "auto" as const,
		// Buy the fast lane where it exists. The gateway only forwards a tier to
		// OpenAI, Google AI Studio, and Vertex, so this is a no-op on the Claude
		// primaries and moves the models we actually default to (`auto`/luna, the
		// Gemini pair, the luna/flash-lite title legs). It is a hint, never a
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

/** Returns the title model's complete Gateway and provider configuration. */
export function getAIThreadTitleGatewayProviderOptions(): WorkspaceAiProviderOptions {
	return {
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
		// Keep title generation at the lowest supported thinking level.
		google: { thinkingConfig: { thinkingLevel: "minimal" } },
		vertex: { thinkingConfig: { thinkingLevel: "minimal" } },
		openai: { reasoningEffort: "none" },
	};
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
		case "gpt-sol":
			return {
				openai: {
					// Sol 6.1 requires reasoning; low is its minimum supported effort.
					reasoningEffort: "low",
				},
			};
		default:
			return {};
	}
}

// Rudimint forwards each call to Vercel AI Gateway unchanged and keeps a copy for
// evaluation and training. Without RUDIMINT_KEY, calls go to Vercel directly.
const RUDIMINT_GATEWAY_URL = "https://api.rudimint.com/vercel/v4/ai";

function getRudimintGatewaySettings(env: Cloudflare.Env, capture?: RudimintCapture) {
	const key = (env as { RUDIMINT_KEY?: string }).RUDIMINT_KEY ?? process.env.RUDIMINT_KEY;

	if (!key) {
		return {};
	}

	const headers: Record<string, string> = { "x-rudimint-key": key };
	if (capture) {
		headers["x-rudimint-task"] = capture.task;
		if (capture.session) headers["x-rudimint-session"] = capture.session;
		if (capture.user) headers["x-rudimint-user"] = capture.user;
		if (capture.metadata) headers["x-rudimint-metadata"] = JSON.stringify(capture.metadata);
	}

	return { baseURL: RUDIMINT_GATEWAY_URL, headers };
}

function getVercelAiGatewayApiKey(env: Cloudflare.Env) {
	const apiKey =
		(env as { AI_GATEWAY_API_KEY?: string }).AI_GATEWAY_API_KEY ?? process.env.AI_GATEWAY_API_KEY;

	if (!apiKey) {
		throw new Error("AI_GATEWAY_API_KEY is required to use Vercel AI Gateway.");
	}

	return apiKey;
}

export async function generateAIThreadTitle(input: {
	env: Cloudflare.Env;
	messages: UIMessage[];
	capture?: RudimintCapture;
}) {
	const firstUserMessage = getFirstUserMessageText(input.messages);

	if (!firstUserMessage) {
		return undefined;
	}

	const result = await generateText({
		model: getWorkspaceAiLanguageModelForGatewayModel(
			AI_THREAD_TITLE_GATEWAY_MODEL,
			input.env,
			input.capture,
		),
		providerOptions: getAIThreadTitleGatewayProviderOptions(),
		instructions:
			"Produce a concise chat title for the user message. Two to six words. No quotes, no trailing punctuation.",
		prompt: firstUserMessage,
	});

	return {
		title: result.text,
		usage: result.totalUsage,
		providerMetadata: await Promise.resolve(result.providerMetadata).catch(() => undefined),
		gatewayModel: AI_THREAD_TITLE_GATEWAY_MODEL,
		responseModel: result.response.modelId,
		durationMs: result.finalStep.performance.responseTimeMs,
	};
}

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
