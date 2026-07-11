import type {
	ChatErrorClassification,
	ChatErrorContext,
	ChatResponseResult,
	PrepareStepContext,
	StepContext,
	ToolCallContext,
	ToolCallResultContext,
	TurnContext,
} from "@cloudflare/think";
import { configure, sendRun, type StepInput, type ToolCallInput } from "@contextcompany/custom";

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import type { AIToolOutcome } from "#/features/workspaces/ai/ai-tool-outcome";
import {
	getWorkspaceAiChatModel,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import {
	getInspectorErrorPayload,
	sanitizeInspectorValue,
	summarizeInspectorMessages,
} from "#/features/workspaces/ai/ai-inspector-serialization";
import {
	buildAiTelemetryToolDefinitions,
	buildTccTokenUsage,
	extractAiTelemetryTokenUsage,
} from "#/features/workspaces/ai/ai-thread-telemetry-format";

const TCC_WORKSPACE_AGENT_NAME = "workspace-assistant";

type TccTelemetryScheduler = (task: Promise<void>) => void;

interface AIThreadTccRecorderOptions {
	schedule?: TccTelemetryScheduler;
}

interface TccActiveStep {
	prompt: string;
	startTime: Date;
}

interface TccActiveToolCall {
	args?: Record<string, unknown>;
	name: string;
	startTime: Date;
}

interface TccTurnState {
	apiKey: string;
	availableToolDefinitions?: unknown[];
	gatewayModel: string;
	metadata: Record<string, string>;
	modelId: WorkspaceAiChatModelId;
	prompt: {
		full_input?: string;
		system_prompt?: string;
		user_prompt: string;
	};
	runId: string;
	sessionId: string;
	startTime: Date;
	steps: StepInput[];
	toolCalls: ToolCallInput[];
	activeSteps: Map<number, TccActiveStep>;
	activeToolCalls: Map<string, TccActiveToolCall>;
	lastStepText?: string;
}

export class AIThreadTccRecorder {
	private readonly schedule?: TccTelemetryScheduler;
	private turn: TccTurnState | null = null;

	constructor(options: AIThreadTccRecorderOptions = {}) {
		this.schedule = options.schedule;
	}

	recordTurnStarted(input: {
		ctx: TurnContext;
		env: Cloudflare.Env;
		modelId: WorkspaceAiChatModelId;
		requestedModelId: WorkspaceAiChatModelId;
		routingReason?: string;
		system: string;
		thread: AIThreadContext;
		tools?: unknown;
	}) {
		const apiKey = getTccApiKey(input.env);

		if (!apiKey) {
			this.turn = null;
			return;
		}

		const gatewayModel = getWorkspaceAiChatModel(input.modelId);
		const prompt = buildTccRunPrompt(input.ctx, input.system);
		const metadata = createTccMetadata({
			gatewayModel,
			modelId: input.modelId,
			requestedModelId: input.requestedModelId,
			routingReason: input.routingReason,
			thread: input.thread,
		});

		this.turn = {
			apiKey,
			availableToolDefinitions: buildTccToolDefinitions(input.tools),
			gatewayModel,
			metadata,
			modelId: input.modelId,
			prompt,
			runId: crypto.randomUUID(),
			sessionId: input.thread.id,
			startTime: new Date(),
			steps: [],
			toolCalls: [],
			activeSteps: new Map(),
			activeToolCalls: new Map(),
		};
	}

	recordStepStarted(ctx: PrepareStepContext) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		turn.activeSteps.set(ctx.stepNumber, {
			prompt: stringifyTccPayload(summarizeInspectorMessages(ctx.messages)),
			startTime: new Date(),
		});
	}

	recordToolStarted(ctx: ToolCallContext) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		turn.activeToolCalls.set(ctx.toolCallId, {
			args: toTccRecord(sanitizeInspectorValue(ctx.input)),
			name: ctx.toolName,
			startTime: new Date(),
		});
	}

	recordToolFinished(ctx: ToolCallResultContext, outcome: AIToolOutcome) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		const activeToolCall = turn.activeToolCalls.get(ctx.toolCallId);
		turn.activeToolCalls.delete(ctx.toolCallId);

		if (!activeToolCall) {
			return;
		}

		turn.toolCalls.push({
			args: activeToolCall.args,
			endTime: new Date(),
			name: activeToolCall.name,
			result: ctx.success
				? toTccRecord(sanitizeInspectorValue(ctx.output))
				: toTccRecord(getInspectorErrorPayload(ctx.error)),
			startTime: activeToolCall.startTime,
			statusCode: outcome.status === "success" ? 0 : 2,
			statusMessage:
				outcome.status === "success"
					? undefined
					: ctx.success
						? `${outcome.status} tool result`
						: getErrorMessage(ctx.error),
			toolCallId: ctx.toolCallId,
		});
	}

	recordStepFinished(ctx: StepContext) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		const activeStep = turn.activeSteps.get(ctx.stepNumber);
		turn.activeSteps.delete(ctx.stepNumber);

		const response = getTccStepResponse(ctx);
		turn.lastStepText = ctx.text || turn.lastStepText;

		turn.steps.push({
			endTime: new Date(),
			finishReason: ctx.finishReason,
			model: {
				requested: turn.modelId,
				used: turn.gatewayModel,
			},
			prompt: activeStep?.prompt ?? stringifyTccPayload(summarizeInspectorMessages(ctx.request)),
			response,
			startTime: activeStep?.startTime ?? turn.startTime,
			stepId: crypto.randomUUID(),
			tokens: buildTccTokenUsage(extractAiTelemetryTokenUsage(ctx.usage)),
			toolDefinitions: turn.availableToolDefinitions,
		});
	}

	recordTurnFinished(result: ChatResponseResult) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		this.turn = null;
		this.sendTurn({
			...turn,
			endTime: new Date(),
			response: turn.lastStepText,
			statusCode: result.status === "error" ? 2 : 0,
			statusMessage: result.status,
		});
	}

	recordTurnError(
		error: unknown,
		input?: {
			errorClassification?: ChatErrorClassification;
			errorStage?: ChatErrorContext["stage"];
			messagesPersisted?: boolean;
			requestId?: string;
		},
	) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		this.turn = null;
		const errorMessage = getErrorMessage(error);
		const statusParts = [input?.errorStage, input?.errorClassification, errorMessage].filter(
			Boolean,
		);
		this.sendTurn({
			...turn,
			endTime: new Date(),
			metadata: {
				...turn.metadata,
				error_classification: input?.errorClassification ?? "",
				error_stage: input?.errorStage ?? "",
				messages_persisted:
					input?.messagesPersisted === undefined ? "" : String(input.messagesPersisted),
				request_id: input?.requestId ?? "",
			},
			response: turn.lastStepText,
			statusCode: 2,
			statusMessage: statusParts.join(": "),
		});
	}

	recordAuxiliaryGeneration(input: {
		env: Cloudflare.Env;
		feature: "compaction" | "thread-title";
		gatewayModel: string;
		latencySeconds: number;
		prompt: string;
		text: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
		usage?: unknown;
	}) {
		this.recordAuxiliaryRun({
			env: input.env,
			feature: input.feature,
			gatewayModel: input.gatewayModel,
			latencySeconds: input.latencySeconds,
			prompt: input.prompt,
			response: input.text,
			thread: input.thread,
			tokens: buildTccTokenUsage(extractAiTelemetryTokenUsage(input.usage)),
		});
	}

	recordAuxiliaryError(input: {
		env: Cloudflare.Env;
		error: unknown;
		feature: "compaction" | "thread-title";
		gatewayModel: string;
		latencySeconds?: number;
		prompt: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
	}) {
		this.recordAuxiliaryRun({
			env: input.env,
			feature: input.feature,
			gatewayModel: input.gatewayModel,
			latencySeconds: input.latencySeconds,
			prompt: input.prompt,
			statusCode: 2,
			statusMessage: getErrorMessage(input.error),
			thread: input.thread,
		});
	}

	private recordAuxiliaryRun(input: {
		env: Cloudflare.Env;
		feature: "compaction" | "thread-title";
		gatewayModel: string;
		latencySeconds?: number;
		prompt: string;
		response?: string;
		statusCode?: number;
		statusMessage?: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
		tokens?: StepInput["tokens"];
	}) {
		const apiKey = getTccApiKey(input.env);
		if (!apiKey) {
			return;
		}

		const endTime = new Date();
		const startTime =
			input.latencySeconds === undefined
				? endTime
				: new Date(endTime.getTime() - input.latencySeconds * 1000);
		const task = sendTccAuxiliaryRun({
			apiKey,
			endTime,
			feature: input.feature,
			gatewayModel: input.gatewayModel,
			prompt: input.prompt,
			response: input.response,
			runId: crypto.randomUUID(),
			sessionId: input.thread.id,
			startTime,
			statusCode: input.statusCode,
			statusMessage: input.statusMessage,
			thread: input.thread,
			tokens: input.tokens,
		}).catch((error: unknown) => {
			recordOperationalFailure({
				distinctId: input.thread.userId,
				error,
				event: "telemetry_delivery",
				fields: {
					provider: "tcc",
					run_kind: "auxiliary",
					thread_id: input.thread.id,
					workspace_id: input.thread.workspaceId,
				},
			});
		});

		if (this.schedule) {
			this.schedule(task);
			return;
		}

		void task;
	}

	private sendTurn(
		input: TccTurnState & {
			endTime: Date;
			response?: string;
			statusCode: number;
			statusMessage?: string;
		},
	) {
		const task = sendTccRun(input).catch((error: unknown) => {
			recordOperationalFailure({
				distinctId: input.metadata["tcc.userId"],
				error,
				event: "telemetry_delivery",
				fields: {
					provider: "tcc",
					run_kind: "turn",
					thread_id: input.sessionId,
					workspace_id: input.metadata.workspace_id,
				},
			});
		});

		if (this.schedule) {
			this.schedule(task);
			return;
		}

		void task;
	}
}

async function sendTccRun(
	input: TccTurnState & {
		endTime: Date;
		response?: string;
		statusCode: number;
		statusMessage?: string;
	},
) {
	configure({ apiKey: input.apiKey });

	await sendRun({
		conversational: true,
		endTime: input.endTime,
		full_output: input.response ? undefined : stringifyTccPayload({ status: input.statusMessage }),
		metadata: input.metadata,
		prompt: input.prompt,
		response: input.response,
		runId: input.runId,
		sessionId: input.sessionId,
		startTime: input.startTime,
		statusCode: input.statusCode,
		statusMessage: input.statusMessage,
		steps: input.steps,
		toolCalls: input.toolCalls,
	});
}

async function sendTccAuxiliaryRun(input: {
	apiKey: string;
	endTime: Date;
	feature: "compaction" | "thread-title";
	gatewayModel: string;
	prompt: string;
	response?: string;
	runId: string;
	sessionId: string;
	startTime: Date;
	statusCode?: number;
	statusMessage?: string;
	thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
	tokens?: StepInput["tokens"];
}) {
	configure({ apiKey: input.apiKey });

	await sendRun({
		conversational: false,
		endTime: input.endTime,
		metadata: {
			"tcc.agent": TCC_WORKSPACE_AGENT_NAME,
			"tcc.conversational": "false",
			"tcc.orgId": input.thread.workspaceId,
			"tcc.sessionId": input.thread.id,
			"tcc.userId": input.thread.userId,
			feature: input.feature,
			gateway_model: input.gatewayModel,
			model_id: input.gatewayModel,
			workspace_id: input.thread.workspaceId,
		},
		prompt: {
			full_input: input.prompt,
			user_prompt: input.feature,
		},
		response: input.response,
		runId: input.runId,
		sessionId: input.sessionId,
		startTime: input.startTime,
		statusCode: input.statusCode ?? 0,
		statusMessage: input.statusMessage ?? "ok",
		steps: [
			{
				endTime: input.endTime,
				finishReason: input.statusCode === 2 ? "error" : "stop",
				model: {
					requested: input.gatewayModel,
					used: input.gatewayModel,
				},
				prompt: input.prompt,
				response: input.response ?? "",
				startTime: input.startTime,
				stepId: crypto.randomUUID(),
				statusCode: input.statusCode,
				statusMessage: input.statusMessage,
				tokens: input.tokens,
			},
		],
	});
}

function getTccApiKey(env: Cloudflare.Env) {
	const apiKey = (env as { TCC_API_KEY?: string }).TCC_API_KEY?.trim();
	return apiKey || undefined;
}

function createTccMetadata(input: {
	gatewayModel: string;
	modelId: WorkspaceAiChatModelId;
	requestedModelId: WorkspaceAiChatModelId;
	routingReason?: string;
	thread: AIThreadContext;
}) {
	return {
		"tcc.agent": TCC_WORKSPACE_AGENT_NAME,
		"tcc.conversational": "true",
		"tcc.orgId": input.thread.workspaceId,
		"tcc.sessionId": input.thread.id,
		"tcc.userId": input.thread.userId,
		feature: "workspace-chat",
		gateway_model: input.gatewayModel,
		model_id: input.modelId,
		mutation_mode: input.thread.promptScope.canMutate ? "mutate" : "view",
		requested_model_id: input.requestedModelId,
		...(input.routingReason ? { routing_reason: input.routingReason } : {}),
		workspace_id: input.thread.workspaceId,
	} satisfies Record<string, string>;
}

function buildTccRunPrompt(ctx: TurnContext, system: string) {
	return {
		full_input: stringifyTccPayload({
			body: sanitizeInspectorValue(ctx.body),
			continuation: ctx.continuation,
			messages: summarizeInspectorMessages(ctx.messages),
		}),
		system_prompt: system,
		user_prompt: getLastUserMessageText(ctx.messages) ?? "User message",
	};
}

function getLastUserMessageText(messages: unknown) {
	if (!Array.isArray(messages)) {
		return undefined;
	}

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (!message || typeof message !== "object") {
			continue;
		}

		const record = message as Record<string, unknown>;
		if (record.role !== "user") {
			continue;
		}

		const text =
			extractTextFromMessageContent(record.content) ?? extractTextFromMessageContent(record.parts);
		if (text) {
			return text;
		}
	}

	return undefined;
}

function extractTextFromMessageContent(content: unknown): string | undefined {
	if (typeof content === "string") {
		return content.trim() || undefined;
	}

	if (!Array.isArray(content)) {
		return undefined;
	}

	const text = content
		.map((part) => {
			if (!part || typeof part !== "object") {
				return undefined;
			}

			const record = part as Record<string, unknown>;
			return typeof record.text === "string" ? record.text : undefined;
		})
		.filter((part): part is string => Boolean(part?.trim()))
		.join("\n");

	return text.trim() || undefined;
}

function getTccStepResponse(ctx: StepContext) {
	if (ctx.text) {
		return ctx.text;
	}

	return stringifyTccPayload({
		response: sanitizeInspectorValue(ctx.response),
		toolCalls: sanitizeInspectorValue(ctx.toolCalls),
		toolResults: sanitizeInspectorValue(ctx.toolResults),
	});
}

function toTccRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return value === undefined ? undefined : { value };
	}

	return value as Record<string, unknown>;
}

function stringifyTccPayload(value: unknown) {
	return JSON.stringify(sanitizeInspectorValue(value));
}

function buildTccToolDefinitions(tools: unknown) {
	return buildAiTelemetryToolDefinitions(tools) ?? undefined;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
