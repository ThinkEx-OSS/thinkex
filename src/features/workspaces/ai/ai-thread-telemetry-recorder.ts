import type {
	ChatErrorContext,
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
	AIThreadInspectorRecorder,
	type AIThreadInspectorHost,
} from "#/features/workspaces/ai/ai-thread-inspector-recorder";
import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { getAIToolOutcome } from "#/features/workspaces/ai/ai-tool-outcome";
import { AIThreadPostHogRecorder } from "#/features/workspaces/ai/ai-thread-posthog-recorder";
import { AIThreadTccRecorder } from "#/features/workspaces/ai/ai-thread-tcc-recorder";
import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

type AIThreadTelemetryScheduler = (task: Promise<void>) => void;

export class AIThreadTelemetryRecorder {
	private readonly env: Cloudflare.Env;
	private readonly inspector: AIThreadInspectorRecorder;
	private readonly posthog: AIThreadPostHogRecorder;
	private readonly tcc: AIThreadTccRecorder;

	constructor(input: {
		env: Cloudflare.Env;
		host: AIThreadInspectorHost;
		schedule?: AIThreadTelemetryScheduler;
	}) {
		this.env = input.env;
		this.inspector = new AIThreadInspectorRecorder(input.host);
		this.posthog = new AIThreadPostHogRecorder({ schedule: input.schedule });
		this.tcc = new AIThreadTccRecorder({ schedule: input.schedule });
	}

	async recordTurnStarted(input: {
		ctx: TurnContext;
		modelId: WorkspaceAiChatModelId;
		system: string;
		thread: AIThreadContext;
		tools: unknown;
	}) {
		await this.inspector.recordTurnStarted(input);
		this.posthog.recordTurnStarted(input);
		this.tcc.recordTurnStarted({
			...input,
			env: this.env,
		});
	}

	recordStepStarted(ctx: PrepareStepContext) {
		this.inspector.recordStepStarted(ctx);
		this.posthog.recordStepStarted(ctx);
		this.tcc.recordStepStarted(ctx);
	}

	recordToolStarted(ctx: ToolCallContext) {
		this.inspector.recordToolStarted(ctx);
		this.posthog.recordToolStarted(ctx);
		this.tcc.recordToolStarted(ctx);
	}

	recordTurnFinished(result: ChatResponseResult) {
		this.inspector.recordTurnFinished(result);
		this.posthog.recordTurnFinished(result);
		this.tcc.recordTurnFinished(result);
	}

	recordTurnError(error: unknown, ctx?: ChatErrorContext) {
		this.inspector.recordTurnError(error);
		this.posthog.recordTurnError(error, {
			errorClassification: ctx?.classification,
			errorStage: ctx?.stage,
			messagesPersisted: ctx?.messagesPersisted,
			requestId: ctx?.requestId,
		});
		this.tcc.recordTurnError(error, {
			errorClassification: ctx?.classification,
			errorStage: ctx?.stage,
			messagesPersisted: ctx?.messagesPersisted,
			requestId: ctx?.requestId,
		});
	}

	recordToolFinished(ctx: ToolCallResultContext) {
		const outcome = getAIToolOutcome(ctx);
		this.inspector.recordToolFinished(ctx);
		this.posthog.recordToolFinished(ctx, outcome);
		this.tcc.recordToolFinished(ctx, outcome);
	}

	recordStepFinished(ctx: StepContext) {
		this.inspector.recordStepFinished(ctx);
		this.posthog.recordStepFinished(ctx);
		this.tcc.recordStepFinished(ctx);
	}

	recordChunk(ctx: ChunkContext) {
		this.inspector.recordChunk(ctx);
		this.posthog.recordChunk(ctx);
	}

	recordAuxiliaryGeneration(input: {
		feature: "compaction" | "thread-title";
		gatewayModel: string;
		latencySeconds: number;
		prompt: string;
		text: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
		usage?: unknown;
	}) {
		this.posthog.recordAuxiliaryGeneration({
			...input,
			traceContext: this.posthog.getActiveTraceContext(),
		});
		this.tcc.recordAuxiliaryGeneration({
			...input,
			env: this.env,
		});
	}

	recordAuxiliaryError(input: {
		error: unknown;
		feature: "chat-recovery" | "compaction" | "thread-title" | "session-prompt-refresh";
		gatewayModel?: string;
		latencySeconds?: number;
		prompt?: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
	}) {
		this.posthog.recordAuxiliaryError({
			...input,
			traceContext: this.posthog.getActiveTraceContext(),
		});

		if (isAiGenerationAuxiliaryError(input)) {
			this.tcc.recordAuxiliaryError({
				...input,
				env: this.env,
			});
		}
	}

	getInspectorSnapshot(threadId: string): AIInspectorSnapshot {
		return this.inspector.getSnapshot(threadId);
	}
}

function isAiGenerationAuxiliaryError(input: {
	error: unknown;
	feature: "chat-recovery" | "compaction" | "thread-title" | "session-prompt-refresh";
	gatewayModel?: string;
	prompt?: string;
	thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
}): input is {
	error: unknown;
	feature: "compaction" | "thread-title";
	gatewayModel: string;
	prompt: string;
	thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
} {
	return (
		(input.feature === "compaction" || input.feature === "thread-title") &&
		input.gatewayModel !== undefined &&
		input.prompt !== undefined
	);
}
