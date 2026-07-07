import type {
	ChatErrorClassification,
	ChatErrorContext,
	ChatResponseResult,
	ChunkContext,
	PrepareStepContext,
	StepContext,
	ToolCallContext,
	ToolCallResultContext,
	TurnContext,
} from "@cloudflare/think";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import {
	buildAiTelemetryInputFromPrompt,
	buildAiTelemetryInputFromStep,
	buildAiTelemetryOutputFromStep,
	buildAiTelemetryOutputFromText,
	buildAiTelemetryToolDefinitions,
	extractAiTelemetryTokenUsage,
	getAiTelemetryToolCallNames,
} from "#/features/workspaces/ai/ai-thread-telemetry-format";
import {
	getWorkspaceAiChatModel,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import {
	capturePostHogAiGeneration,
	capturePostHogAiSpan,
} from "#/integrations/posthog/ai-observability";
import {
	capturePostHogServerEvent,
	capturePostHogServerException,
} from "#/integrations/posthog/server";
import { emptyTelemetryRequestContext } from "#/integrations/posthog/server-context";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

function parseGatewayModel(gatewayModel: string) {
	const slashIndex = gatewayModel.indexOf("/");

	if (slashIndex === -1) {
		return {
			provider: "vercel-ai-gateway",
			model: gatewayModel,
		};
	}

	return {
		provider: gatewayModel.slice(0, slashIndex),
		model: gatewayModel.slice(slashIndex + 1),
	};
}

interface PostHogTurnState {
	availableTools: unknown[] | null;
	distinctId: string;
	sessionId: string;
	traceId: string;
	turnRootSpanId: string;
	workspaceId: string;
	modelId: string;
	gatewayModel: string;
	stepCount: number;
	turnStartedAt: number;
	currentStepStartedAt?: number;
	currentStepFirstTokenAt?: number;
	currentGenerationSpanId?: string;
	activeToolSpans: Map<string, { spanId: string; startedAt: number }>;
}

function turnTelemetryProperties(turn: PostHogTurnState) {
	return {
		thread_id: turn.sessionId,
		workspace_id: turn.workspaceId,
		trace_id: turn.traceId,
	};
}

function aiExceptionTelemetryProperties(input: {
	errorClassification?: ChatErrorClassification;
	errorStage?: ChatErrorContext["stage"];
	feature: string;
	messagesPersisted?: boolean;
	requestId?: string;
	sessionId: string;
	spanId?: string;
	spanName?: string;
	traceId: string;
	workspaceId: string;
}) {
	return {
		exception_source: "ai_chat",
		feature: input.feature,
		thread_id: input.sessionId,
		workspace_id: input.workspaceId,
		trace_id: input.traceId,
		error_stage: input.errorStage ?? null,
		error_classification: input.errorClassification ?? null,
		request_id: input.requestId ?? null,
		messages_persisted: input.messagesPersisted ?? null,
		$ai_trace_id: input.traceId,
		$ai_session_id: input.sessionId,
		...(input.spanId ? { $ai_span_id: input.spanId } : {}),
		...(input.spanName ? { $ai_span_name: input.spanName } : {}),
	};
}

export interface AIThreadPostHogTraceContext {
	distinctId: string;
	sessionId: string;
	traceId: string;
	workspaceId: string;
	parentSpanId: string;
}

interface AIThreadPostHogRecorderOptions {
	schedule?: PostHogTelemetryScheduler;
}

interface AgentPostHogRuntime {
	requestContext: typeof emptyTelemetryRequestContext;
	schedule?: PostHogTelemetryScheduler;
}

export class AIThreadPostHogRecorder {
	private turn: PostHogTurnState | null = null;
	private readonly schedule?: PostHogTelemetryScheduler;
	private readonly serverEventRuntime: AgentPostHogRuntime;

	constructor(options: AIThreadPostHogRecorderOptions = {}) {
		this.schedule = options.schedule;
		this.serverEventRuntime = {
			requestContext: emptyTelemetryRequestContext,
			schedule: options.schedule,
		};
	}

	recordTurnStarted(input: {
		ctx: TurnContext;
		modelId: WorkspaceAiChatModelId;
		requestedModelId: WorkspaceAiChatModelId;
		routingReason?: string;
		thread: AIThreadContext;
		tools?: unknown;
	}) {
		const traceId = crypto.randomUUID();
		const turnRootSpanId = crypto.randomUUID();
		const gatewayModel = getWorkspaceAiChatModel(input.modelId);

		const turn: PostHogTurnState = {
			availableTools: buildAiTelemetryToolDefinitions(input.tools),
			distinctId: input.thread.userId,
			sessionId: input.thread.id,
			traceId,
			turnRootSpanId,
			workspaceId: input.thread.workspaceId,
			modelId: input.modelId,
			gatewayModel,
			stepCount: 0,
			turnStartedAt: Date.now(),
			activeToolSpans: new Map(),
		};
		this.turn = turn;

		capturePostHogServerEvent({
			distinctId: input.thread.userId,
			event: "ai_turn_started",
			properties: {
				...turnTelemetryProperties(turn),
				model_id: input.modelId,
				requested_model_id: input.requestedModelId,
				routing_reason: input.routingReason ?? null,
				continuation: Boolean(input.ctx.continuation),
			},
			...this.serverEventRuntime,
		});
	}

	recordStepStarted(_ctx: PrepareStepContext) {
		if (!this.turn) {
			return;
		}

		this.turn.currentStepStartedAt = Date.now();
		this.turn.currentStepFirstTokenAt = undefined;
		this.turn.currentGenerationSpanId = crypto.randomUUID();
	}

	recordToolStarted(ctx: ToolCallContext) {
		if (!this.turn) {
			return;
		}

		this.turn.activeToolSpans.set(ctx.toolCallId, {
			spanId: crypto.randomUUID(),
			startedAt: Date.now(),
		});
	}

	recordToolFinished(ctx: ToolCallResultContext) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		const activeToolSpan = turn.activeToolSpans.get(ctx.toolCallId);
		turn.activeToolSpans.delete(ctx.toolCallId);

		if (!activeToolSpan) {
			return;
		}

		capturePostHogAiSpan({
			distinctId: turn.distinctId,
			traceId: turn.traceId,
			sessionId: turn.sessionId,
			spanId: activeToolSpan.spanId,
			spanName: ctx.toolName,
			parentId: turn.currentGenerationSpanId ?? turn.turnRootSpanId,
			inputState: ctx.input,
			outputState: ctx.success ? ctx.output : undefined,
			latencySeconds: ctx.durationMs / 1000,
			isError: !ctx.success,
			error: ctx.success ? undefined : ctx.error,
			properties: {
				...turnTelemetryProperties(turn),
				tool_call_id: ctx.toolCallId,
				step_number: ctx.stepNumber,
			},
			schedule: this.schedule,
		});

		capturePostHogServerEvent({
			distinctId: turn.distinctId,
			event: "ai_tool_invoked",
			properties: {
				...turnTelemetryProperties(turn),
				tool_name: ctx.toolName,
				success: ctx.success,
				duration_ms: ctx.durationMs,
			},
			...this.serverEventRuntime,
		});
	}

	recordStepFinished(ctx: StepContext) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		turn.stepCount += 1;

		const { provider, model } = parseGatewayModel(turn.gatewayModel);
		const stepStartedAt = turn.currentStepStartedAt ?? turn.turnStartedAt;
		const latencySeconds = (Date.now() - stepStartedAt) / 1000;
		const timeToFirstToken =
			turn.currentStepFirstTokenAt !== undefined
				? (turn.currentStepFirstTokenAt - stepStartedAt) / 1000
				: undefined;
		const toolCallNames = getAiTelemetryToolCallNames(ctx.toolCalls);
		const generationSpanId = turn.currentGenerationSpanId ?? crypto.randomUUID();

		capturePostHogAiGeneration({
			distinctId: turn.distinctId,
			traceId: turn.traceId,
			sessionId: turn.sessionId,
			spanName: "chat_step",
			parentId: turn.turnRootSpanId,
			spanId: generationSpanId,
			provider,
			model,
			input: buildAiTelemetryInputFromStep(ctx),
			output: buildAiTelemetryOutputFromStep(ctx),
			usage: extractAiTelemetryTokenUsage(ctx.usage),
			latency: latencySeconds,
			timeToFirstToken,
			stopReason: ctx.finishReason,
			tools: turn.availableTools,
			properties: {
				...turnTelemetryProperties(turn),
				model_id: turn.modelId,
				step_number: ctx.stepNumber,
				feature: "workspace-chat",
				$ai_stream: timeToFirstToken !== undefined,
				...(toolCallNames.length > 0
					? {
							$ai_tools_called: toolCallNames,
							$ai_tool_call_count: toolCallNames.length,
						}
					: {}),
			},
			schedule: this.schedule,
		});

		turn.currentStepStartedAt = undefined;
		turn.currentStepFirstTokenAt = undefined;
		turn.currentGenerationSpanId = undefined;
	}

	recordChunk(ctx: ChunkContext) {
		const turn = this.turn;
		if (!turn || turn.currentStepFirstTokenAt !== undefined) {
			return;
		}

		const chunk = ctx.chunk as Record<string, unknown> | undefined;
		if (chunk?.type === "text-delta" || chunk?.type === "reasoning-delta") {
			turn.currentStepFirstTokenAt = Date.now();
		}
	}

	recordTurnFinished(result: ChatResponseResult) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		capturePostHogAiSpan({
			distinctId: turn.distinctId,
			traceId: turn.traceId,
			sessionId: turn.sessionId,
			spanId: turn.turnRootSpanId,
			spanName: "workspace_chat_turn",
			outputState: {
				status: result.status,
				stepCount: turn.stepCount,
			},
			latencySeconds: (Date.now() - turn.turnStartedAt) / 1000,
			properties: turnTelemetryProperties(turn),
			schedule: this.schedule,
		});

		capturePostHogServerEvent({
			distinctId: turn.distinctId,
			event: "ai_turn_completed",
			properties: {
				...turnTelemetryProperties(turn),
				status: result.status,
				step_count: turn.stepCount,
			},
			...this.serverEventRuntime,
		});

		this.turn = null;
	}

	recordTurnError(
		error: unknown,
		input?: {
			errorStage?: ChatErrorContext["stage"];
			errorClassification?: ChatErrorClassification;
			messagesPersisted?: boolean;
			requestId?: string;
		},
	) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		capturePostHogAiSpan({
			distinctId: turn.distinctId,
			traceId: turn.traceId,
			sessionId: turn.sessionId,
			spanId: turn.turnRootSpanId,
			spanName: "workspace_chat_turn",
			outputState: {
				errorStage: input?.errorStage ?? null,
				errorClassification: input?.errorClassification ?? null,
			},
			latencySeconds: (Date.now() - turn.turnStartedAt) / 1000,
			isError: true,
			error,
			properties: turnTelemetryProperties(turn),
			schedule: this.schedule,
		});

		capturePostHogServerEvent({
			distinctId: turn.distinctId,
			event: "ai_turn_failed",
			properties: {
				...turnTelemetryProperties(turn),
				error_stage: input?.errorStage ?? null,
				error_classification: input?.errorClassification ?? null,
				error_message: error instanceof Error ? error.message : String(error),
				messages_persisted: input?.messagesPersisted ?? null,
				request_id: input?.requestId ?? null,
			},
			...this.serverEventRuntime,
		});

		capturePostHogServerException({
			distinctId: turn.distinctId,
			error,
			properties: aiExceptionTelemetryProperties({
				errorClassification: input?.errorClassification,
				errorStage: input?.errorStage,
				messagesPersisted: input?.messagesPersisted,
				requestId: input?.requestId,
				feature: "workspace-chat",
				sessionId: turn.sessionId,
				spanId: turn.turnRootSpanId,
				spanName: "workspace_chat_turn",
				traceId: turn.traceId,
				workspaceId: turn.workspaceId,
			}),
			...this.serverEventRuntime,
		});

		this.turn = null;
	}

	getActiveTraceContext(): AIThreadPostHogTraceContext | null {
		if (!this.turn) {
			return null;
		}

		return {
			distinctId: this.turn.distinctId,
			sessionId: this.turn.sessionId,
			traceId: this.turn.traceId,
			workspaceId: this.turn.workspaceId,
			parentSpanId: this.turn.turnRootSpanId,
		};
	}

	recordAuxiliaryGeneration(input: {
		feature: "compaction" | "thread-title";
		gatewayModel: string;
		prompt: string;
		text: string;
		usage?: unknown;
		latencySeconds: number;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
		traceContext?: AIThreadPostHogTraceContext | null;
	}) {
		const traceContext = input.traceContext;
		const traceId = traceContext?.traceId ?? crypto.randomUUID();
		const parentId = traceContext?.parentSpanId;
		const distinctId = traceContext?.distinctId ?? input.thread.userId;
		const sessionId = traceContext?.sessionId ?? input.thread.id;
		const workspaceId = traceContext?.workspaceId ?? input.thread.workspaceId;
		const { provider, model } = parseGatewayModel(input.gatewayModel);

		capturePostHogAiGeneration({
			distinctId,
			traceId,
			sessionId,
			spanName: input.feature,
			parentId,
			spanId: crypto.randomUUID(),
			provider,
			model,
			input: buildAiTelemetryInputFromPrompt(input.prompt),
			output: buildAiTelemetryOutputFromText(input.text),
			usage: extractAiTelemetryTokenUsage(input.usage),
			latency: input.latencySeconds,
			properties: {
				thread_id: input.thread.id,
				workspace_id: workspaceId,
				feature: input.feature,
			},
			schedule: this.schedule,
		});
	}

	recordAuxiliaryError(input: {
		error: unknown;
		feature: "chat-recovery" | "compaction" | "thread-title" | "session-prompt-refresh";
		gatewayModel?: string;
		latencySeconds?: number;
		prompt?: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
		traceContext?: AIThreadPostHogTraceContext | null;
	}) {
		const traceContext = input.traceContext;
		const traceId = traceContext?.traceId ?? crypto.randomUUID();
		const parentId = traceContext?.parentSpanId;
		const distinctId = traceContext?.distinctId ?? input.thread.userId;
		const sessionId = traceContext?.sessionId ?? input.thread.id;
		const workspaceId = traceContext?.workspaceId ?? input.thread.workspaceId;
		const spanId = input.gatewayModel && input.prompt ? crypto.randomUUID() : undefined;

		if (input.gatewayModel && input.prompt) {
			const { provider, model } = parseGatewayModel(input.gatewayModel);

			capturePostHogAiGeneration({
				distinctId,
				traceId,
				sessionId,
				spanName: input.feature,
				parentId,
				spanId,
				provider,
				model,
				input: buildAiTelemetryInputFromPrompt(input.prompt),
				output: [],
				latency: input.latencySeconds,
				error: input.error,
				properties: {
					thread_id: input.thread.id,
					workspace_id: workspaceId,
					feature: input.feature,
				},
				schedule: this.schedule,
			});
		}

		capturePostHogServerException({
			distinctId,
			error: input.error,
			properties: {
				...aiExceptionTelemetryProperties({
					sessionId,
					feature: input.feature,
					spanId,
					spanName: input.feature,
					traceId,
					workspaceId,
				}),
				parent_span_id: parentId ?? null,
			},
			...this.serverEventRuntime,
		});
	}
}
