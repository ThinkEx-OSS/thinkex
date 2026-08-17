import { capturePostHogAiGeneration } from "#/integrations/posthog/ai-observability";

// LLM analytics for the chat: one $ai_generation event per model call — the
// turn itself plus its utility calls (compaction summary, title) — sharing the
// turn's streamId as the trace id so PostHog groups them into one trace per
// turn, keyed to the thread as the session. Metadata only (privacyMode is
// forced on in the capture layer): usage, latency, served route, outcome —
// never message content.

export type AiChatGenerationTask = "chat-turn" | "chat-compaction" | "chat-title";

export interface AiChatGenerationTelemetry {
	userId: string;
	workspaceId: string;
	threadId: string;
	/** The turn's stream id — one trace groups the turn and its utility calls. */
	traceId: string;
	/** The gateway model string, e.g. "anthropic/claude-sonnet-5". */
	gatewayModel: string;
	/** The app-level model id the user picked, for the requested_model property. */
	requestedModel?: string;
	task: AiChatGenerationTask;
	startedAt: number;
	firstTokenAt?: number;
	/** AI SDK usage (`result.totalUsage` / `result.usage`). */
	usage?: unknown;
	/** `result.providerMetadata`, for served-route attribution. */
	providerMetadata?: unknown;
	outcome?: "complete" | "interrupted" | "error";
	errorMessage?: string;
	toolNames?: string[];
}

export function captureAiChatGeneration(input: AiChatGenerationTelemetry) {
	const gatewayModel = input.gatewayModel;
	const slash = gatewayModel.indexOf("/");
	const usage = input.usage as
		| {
				inputTokens?: number;
				outputTokens?: number;
				reasoningTokens?: number;
				cachedInputTokens?: number;
		  }
		| undefined;

	capturePostHogAiGeneration({
		distinctId: input.userId,
		traceId: input.traceId,
		sessionId: input.threadId,
		spanName: input.task,
		// Requested route; capturePostHogAiGeneration overrides provider with the
		// gateway's actual served route when providerMetadata records one.
		provider: slash === -1 ? "vercel-ai-gateway" : gatewayModel.slice(0, slash),
		model: slash === -1 ? gatewayModel : gatewayModel.slice(slash + 1),
		input: null,
		output: null,
		latency: (Date.now() - input.startedAt) / 1000,
		...(input.firstTokenAt !== undefined
			? { timeToFirstToken: (input.firstTokenAt - input.startedAt) / 1000 }
			: {}),
		...(usage
			? {
					usage: {
						inputTokens: usage.inputTokens,
						outputTokens: usage.outputTokens,
						reasoningTokens: usage.reasoningTokens,
						cacheReadInputTokens: usage.cachedInputTokens,
					},
				}
			: {}),
		...(input.outcome === "error" ? { error: input.errorMessage ?? "chat turn failed" } : {}),
		providerMetadata: (input.providerMetadata ?? undefined) as Record<string, unknown> | undefined,
		properties: {
			task: input.task,
			workspace_id: input.workspaceId,
			thread_id: input.threadId,
			...(input.requestedModel ? { requested_model: input.requestedModel } : {}),
			...(input.outcome ? { outcome: input.outcome } : {}),
			...(input.toolNames && input.toolNames.length > 0 ? { tool_names: input.toolNames } : {}),
		},
	});
}

// Tool names off a persisted assistant message's parts, for the turn event.
export function toolNamesFromParts(parts: { type: string }[]): string[] {
	return [
		...new Set(
			parts
				.filter((part) => part.type.startsWith("tool-"))
				.map((part) => part.type.slice("tool-".length)),
		),
	];
}
