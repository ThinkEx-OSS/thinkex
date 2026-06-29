import type {
	ChatResponseResult,
	ChunkContext,
	PrepareStepContext,
	StepContext,
	ToolCallContext,
	ToolCallResultContext,
	TurnContext,
} from "@cloudflare/think";

import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import {
	createInspectorChunkAccumulator,
	getInspectorErrorPayload,
	recordInspectorChunk,
	resetInspectorChunkAccumulator,
	sanitizeInspectorValue,
	summarizeInspectorChunks,
	summarizeInspectorMessages,
	summarizeInspectorToolList,
	summarizeInspectorToolResultList,
	summarizeInspectorTools,
} from "#/features/workspaces/ai/ai-inspector-serialization";
import {
	beginAIInspectorRun,
	createAIInspectorRecorderState,
	getAIInspectorSnapshot,
	recordAIInspectorEvent,
} from "#/features/workspaces/ai/ai-inspector-store";
import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";

type AIThreadInspectorHost = {
	sql<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): T[];
};

export class AIThreadInspectorRecorder {
	private readonly host: AIThreadInspectorHost;
	private readonly state = createAIInspectorRecorderState();
	private readonly chunks = createInspectorChunkAccumulator();

	constructor(host: AIThreadInspectorHost) {
		this.host = host;
	}

	async recordTurnStarted(input: {
		ctx: TurnContext;
		modelId: string;
		system: string;
		thread: AIThreadContext;
		tools: unknown;
	}) {
		beginAIInspectorRun(this.state);
		resetInspectorChunkAccumulator(this.chunks);
		recordAIInspectorEvent(this.host, this.state, "turn.started", {
			body: sanitizeInspectorValue(input.ctx.body),
			continuation: input.ctx.continuation,
			messages: summarizeInspectorMessages(input.ctx.messages),
			modelId: input.modelId,
			system: input.system,
			thread: input.thread,
			tools: await summarizeInspectorTools(input.tools),
		});
	}

	recordStepStarted(ctx: PrepareStepContext) {
		resetInspectorChunkAccumulator(this.chunks);
		recordAIInspectorEvent(this.host, this.state, "step.started", {
			messages: summarizeInspectorMessages(ctx.messages),
			stepNumber: ctx.stepNumber,
		});
	}

	recordToolStarted(ctx: ToolCallContext) {
		recordAIInspectorEvent(this.host, this.state, "tool.started", {
			input: sanitizeInspectorValue(ctx.input),
			messages: summarizeInspectorMessages(ctx.messages),
			providerMetadata: sanitizeInspectorValue(ctx.providerMetadata),
			stepNumber: ctx.stepNumber,
			toolCallId: ctx.toolCallId,
			toolName: ctx.toolName,
		});
	}

	recordTurnFinished(result: ChatResponseResult) {
		recordAIInspectorEvent(this.host, this.state, "turn.finished", {
			result: sanitizeInspectorValue(result),
		});
	}

	recordTurnError(error: unknown) {
		recordAIInspectorEvent(this.host, this.state, "turn.error", getInspectorErrorPayload(error));
	}

	recordToolFinished(ctx: ToolCallResultContext) {
		recordAIInspectorEvent(this.host, this.state, "tool.finished", {
			durationMs: ctx.durationMs,
			input: sanitizeInspectorValue(ctx.input),
			messages: summarizeInspectorMessages(ctx.messages),
			output: ctx.success ? sanitizeInspectorValue(ctx.output) : undefined,
			error: ctx.success ? undefined : getInspectorErrorPayload(ctx.error),
			providerMetadata: sanitizeInspectorValue(ctx.providerMetadata),
			stepNumber: ctx.stepNumber,
			success: ctx.success,
			toolCallId: ctx.toolCallId,
			toolName: ctx.toolName,
		});
	}

	recordStepFinished(ctx: StepContext) {
		recordAIInspectorEvent(this.host, this.state, "step.finished", {
			files: sanitizeInspectorValue(ctx.files),
			finishReason: ctx.finishReason,
			providerMetadata: sanitizeInspectorValue(ctx.providerMetadata),
			chunkSummary: summarizeInspectorChunks(this.chunks),
			reasoning: sanitizeInspectorValue(ctx.reasoning),
			request: sanitizeInspectorValue(ctx.request),
			response: sanitizeInspectorValue(ctx.response),
			sources: sanitizeInspectorValue(ctx.sources),
			text: ctx.text,
			toolCalls: summarizeInspectorToolList(ctx.toolCalls),
			toolResults: summarizeInspectorToolResultList(ctx.toolResults),
			usage: sanitizeInspectorValue(ctx.usage),
			warnings: sanitizeInspectorValue(ctx.warnings),
		});
	}

	recordChunk(ctx: ChunkContext) {
		recordInspectorChunk(this.chunks, ctx.chunk);
	}

	getSnapshot(threadId: string): AIInspectorSnapshot {
		return getAIInspectorSnapshot(this.host, this.state, threadId);
	}
}
