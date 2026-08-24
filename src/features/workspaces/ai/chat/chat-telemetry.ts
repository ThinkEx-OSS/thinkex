import type {
	GenerateTextStepEndEvent,
	LanguageModelUsage,
	ProviderMetadata,
	ToolExecutionEndEvent,
} from "ai";

import { fitTelemetryContent } from "#/features/workspaces/ai/chat/chat-model";
import { capturePostHogAiGeneration } from "#/integrations/posthog/ai-observability";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

// LLM analytics for the chat: one $ai_generation per actual model step or
// utility call, sharing the turn's streamId as trace id and thread as session.
//
// Content policy: full prompt/response content is captured by default — we are
// early, and the conversation is the debugging signal. A user whose analytics
// consent is off (cookie choice, GPC, or opt-in region without a choice) drops
// the event to metadata-only: usage, latency, served route, outcome.

export type AiChatGenerationTask = "chat-step" | "chat-compaction" | "chat-title";

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
	/** Model identifier reported by the provider response. */
	responseModel?: string;
	/** Exact provider-response duration from the AI SDK step. */
	durationMs?: number;
	/** Exact time to first provider output from the AI SDK step. */
	timeToFirstOutputMs?: number;
	spanId?: string;
	schedule?: PostHogTelemetryScheduler;
	/** AI SDK usage (`result.totalUsage` / `result.usage`). */
	usage?: LanguageModelUsage;
	/** `result.providerMetadata`, for served-route attribution. */
	providerMetadata?: ProviderMetadata;
	outcome?: "complete" | "interrupted" | "error";
	errorMessage?: string;
	toolNames?: string[];
	/** The request's analytics consent. False strips content, keeps metadata. */
	includeContent: boolean;
	/** What the model saw, `[{role, content}]`-shaped. Oldest dropped to fit. */
	input?: unknown[];
	/** The model's reply in the same shape. */
	output?: unknown[];
	properties?: Record<string, unknown>;
}

export function captureAiChatGeneration(input: AiChatGenerationTelemetry) {
	const gatewayModel = input.gatewayModel;
	const slash = gatewayModel.indexOf("/");
	const usage = input.usage;

	capturePostHogAiGeneration({
		distinctId: input.userId,
		traceId: input.traceId,
		sessionId: input.threadId,
		spanName: input.task,
		// Requested route; capturePostHogAiGeneration overrides provider with the
		// gateway's actual served route when providerMetadata records one.
		provider: slash === -1 ? "vercel-ai-gateway" : gatewayModel.slice(0, slash),
		model: input.responseModel ?? (slash === -1 ? gatewayModel : gatewayModel.slice(slash + 1)),
		input: input.includeContent ? fitTelemetryContent(input.input ?? []) : null,
		output: input.includeContent ? (input.output ?? null) : null,
		...(input.includeContent ? { privacyMode: false } : {}),
		latency: (input.durationMs ?? Date.now() - input.startedAt) / 1000,
		...(input.timeToFirstOutputMs !== undefined
			? { timeToFirstToken: input.timeToFirstOutputMs / 1000 }
			: {}),
		...(usage
			? {
					usage: {
						inputTokens: usage.inputTokens,
						outputTokens: usage.outputTokens,
						reasoningTokens: usage.outputTokenDetails.reasoningTokens,
						cacheReadInputTokens: usage.inputTokenDetails.cacheReadTokens,
					},
				}
			: {}),
		...(input.outcome === "error" ? { error: input.errorMessage ?? "chat turn failed" } : {}),
		providerMetadata: input.providerMetadata,
		spanId: input.spanId,
		schedule: input.schedule,
		properties: {
			...input.properties,
			task: input.task,
			workspace_id: input.workspaceId,
			thread_id: input.threadId,
			...(input.requestedModel ? { requested_model: input.requestedModel } : {}),
			...(input.outcome ? { outcome: input.outcome } : {}),
			...(input.toolNames && input.toolNames.length > 0 ? { tool_names: input.toolNames } : {}),
		},
	});
}

type AiChatStepTelemetry = Pick<
	GenerateTextStepEndEvent,
	"callId" | "stepNumber" | "text" | "finishReason" | "usage"
> & {
	providerMetadata?: GenerateTextStepEndEvent["providerMetadata"];
	response: Pick<GenerateTextStepEndEvent["response"], "modelId">;
	performance: Pick<GenerateTextStepEndEvent["performance"], "responseTimeMs" | "stepTimeMs"> &
		Partial<Pick<GenerateTextStepEndEvent["performance"], "timeToFirstOutputMs">>;
	toolCalls: ReadonlyArray<Pick<GenerateTextStepEndEvent["toolCalls"][number], "toolName">>;
};

type AiToolExecutionTelemetry = Pick<ToolExecutionEndEvent, "callId" | "toolExecutionMs"> & {
	toolCall: Pick<ToolExecutionEndEvent["toolCall"], "toolCallId" | "toolName">;
	toolOutput: Pick<ToolExecutionEndEvent["toolOutput"], "type">;
};

/** Records one chat turn without conflating its model steps, tools, and wall time. */
export function createAiChatTurnTelemetry(input: {
	userId: string;
	workspaceId: string;
	threadId: string;
	traceId: string;
	modelId: string;
	gatewayModel: string;
	continuation: boolean;
	includeContent: boolean;
	modelInput: unknown[];
	schedule: PostHogTelemetryScheduler;
}) {
	const startedAt = Date.now();
	let firstVisibleTextAt: number | undefined;
	const steps: AiChatStepTelemetry[] = [];

	capturePostHogServerEvent({
		distinctId: input.userId,
		event: "ai_turn_started",
		consentExempt: true,
		schedule: input.schedule,
		properties: {
			thread_id: input.threadId,
			workspace_id: input.workspaceId,
			trace_id: input.traceId,
			model_id: input.modelId,
			continuation: input.continuation,
		},
	});

	return {
		onChunk(chunk: { type: string; text?: string }) {
			if (chunk.type === "text-delta" && chunk.text && firstVisibleTextAt === undefined) {
				firstVisibleTextAt = Date.now();
			}
		},
		onStepEnd(step: AiChatStepTelemetry) {
			steps.push(step);
		},
		onToolExecutionEnd(event: AiToolExecutionTelemetry) {
			const success = event.toolOutput.type === "tool-result";
			capturePostHogServerEvent({
				distinctId: input.userId,
				event: "ai_tool_invoked",
				consentExempt: true,
				schedule: input.schedule,
				properties: {
					thread_id: input.threadId,
					workspace_id: input.workspaceId,
					trace_id: input.traceId,
					tool_name: event.toolCall.toolName,
					success,
					duration_ms: event.toolExecutionMs,
					failure_codes: [],
					failure_count: success ? 0 : 1,
					outcome: success ? "success" : "error",
					runtime_success: success,
					call_id: event.callId,
					tool_call_id: event.toolCall.toolCallId,
				},
			});
		},
		finish(status: "complete" | "interrupted" | "error", errorMessage?: string) {
			const durationMs = Date.now() - startedAt;

			for (const [index, step] of steps.entries()) {
				const hasVisibleText = step.text.trim().length > 0;
				const isFinalStep = index === steps.length - 1;
				captureAiChatGeneration({
					userId: input.userId,
					workspaceId: input.workspaceId,
					threadId: input.threadId,
					traceId: input.traceId,
					spanId: step.callId,
					gatewayModel: input.gatewayModel,
					responseModel: step.response.modelId,
					requestedModel: input.modelId,
					task: "chat-step",
					startedAt,
					durationMs: step.performance.responseTimeMs,
					timeToFirstOutputMs: step.performance.timeToFirstOutputMs,
					usage: step.usage,
					providerMetadata: step.providerMetadata,
					outcome: "complete",
					toolNames: step.toolCalls.map((call) => call.toolName),
					includeContent: input.includeContent && hasVisibleText && isFinalStep,
					input: input.modelInput,
					...(hasVisibleText && isFinalStep
						? { output: [{ role: "assistant", content: step.text }] }
						: {}),
					schedule: input.schedule,
					properties: {
						step_number: step.stepNumber,
						finish_reason: step.finishReason,
						step_time_ms: step.performance.stepTimeMs,
						has_visible_text: hasVisibleText,
						is_final_step: isFinalStep,
						turn_status: status,
					},
				});
			}

			capturePostHogServerEvent({
				distinctId: input.userId,
				event: "ai_turn_completed",
				consentExempt: true,
				schedule: input.schedule,
				properties: {
					thread_id: input.threadId,
					workspace_id: input.workspaceId,
					trace_id: input.traceId,
					status,
					step_count: steps.length,
					duration_ms: durationMs,
					time_to_first_visible_text_ms:
						firstVisibleTextAt === undefined ? null : firstVisibleTextAt - startedAt,
				},
			});

			if (status === "error") {
				capturePostHogServerEvent({
					distinctId: input.userId,
					event: "ai_turn_failed",
					consentExempt: true,
					schedule: input.schedule,
					properties: {
						thread_id: input.threadId,
						workspace_id: input.workspaceId,
						trace_id: input.traceId,
						error_stage: "stream",
						error_classification: null,
						error_message: errorMessage ?? "chat turn failed",
						messages_persisted: null,
						request_id: null,
					},
				});
			}
		},
	};
}
