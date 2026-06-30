import type {
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
import {
	getWorkspaceAiChatModel,
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import {
	getInspectorErrorPayload,
	sanitizeInspectorValue,
	summarizeInspectorMessages,
} from "#/features/workspaces/ai/ai-inspector-serialization";

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
		system: string;
		thread: AIThreadContext;
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
			thread: input.thread,
		});

		this.turn = {
			apiKey,
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

	recordToolFinished(ctx: ToolCallResultContext) {
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
			statusCode: ctx.success ? 0 : 2,
			statusMessage: ctx.success ? undefined : getErrorMessage(ctx.error),
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
			tokens: extractTccTokenUsage(ctx.usage),
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
			errorStage?: ChatErrorContext["stage"];
		},
	) {
		const turn = this.turn;
		if (!turn) {
			return;
		}

		this.turn = null;
		this.sendTurn({
			...turn,
			endTime: new Date(),
			response: turn.lastStepText,
			statusCode: 2,
			statusMessage: [input?.errorStage, getErrorMessage(error)].filter(Boolean).join(": "),
		});
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
			console.warn("[AIThread] TCC telemetry export failed", error);
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

function getTccApiKey(env: Cloudflare.Env) {
	const apiKey = (env as { TCC_API_KEY?: string }).TCC_API_KEY?.trim();
	return apiKey || undefined;
}

function createTccMetadata(input: {
	gatewayModel: string;
	modelId: WorkspaceAiChatModelId;
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

function extractTccTokenUsage(usage: unknown) {
	if (!usage || typeof usage !== "object") {
		return undefined;
	}

	const record = usage as Record<string, unknown>;
	const inputTokens = getNumberValue(record.inputTokens) ?? getNumberValue(record.promptTokens);
	const cachedTokens = getNumberValue(record.cachedInputTokens);
	const outputTokens =
		getNumberValue(record.outputTokens) ?? getNumberValue(record.completionTokens);

	return {
		uncached:
			inputTokens === undefined ? undefined : Math.max(0, inputTokens - (cachedTokens ?? 0)),
		cached: cachedTokens,
		completion: outputTokens,
	};
}

function getNumberValue(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}
