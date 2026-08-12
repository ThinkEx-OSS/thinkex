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

import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
import { getAIToolOutcome } from "#/features/workspaces/ai/ai-tool-outcome";
import { AIThreadPostHogRecorder } from "#/features/workspaces/ai/ai-thread-posthog-recorder";
import { AIThreadTccRecorder } from "#/features/workspaces/ai/ai-thread-tcc-recorder";
import type { WorkspaceAiChatModelId } from "#/features/workspaces/ai/models";

type AIThreadTelemetryScheduler = (task: Promise<void>) => void;

export class AIThreadTelemetryRecorder {
	private readonly env: Cloudflare.Env;
	private readonly posthog: AIThreadPostHogRecorder;
	private readonly tcc: AIThreadTccRecorder;
	/** Consent arrives per turn because the Durable Object cannot read browser cookies. */
	private analyticsConsent = false;
	private sessionReplayConsent = false;

	constructor(input: { env: Cloudflare.Env; schedule?: AIThreadTelemetryScheduler }) {
		this.env = input.env;
		this.posthog = new AIThreadPostHogRecorder({ schedule: input.schedule });
		this.tcc = new AIThreadTccRecorder({ schedule: input.schedule });
	}

	setConsent(input: { analytics: boolean; sessionReplay: boolean }) {
		this.analyticsConsent = input.analytics;
		this.sessionReplayConsent = input.analytics && input.sessionReplay;
	}

	recordTurnStarted(input: {
		ctx: TurnContext;
		modelId: WorkspaceAiChatModelId;
		instructions: string;
		thread: AIThreadContext;
		tools: unknown;
	}) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordTurnStarted(input, this.sessionReplayConsent);
		if (this.sessionReplayConsent) {
			this.tcc.recordTurnStarted({
				...input,
				env: this.env,
			});
		}
	}

	recordStepStarted(ctx: PrepareStepContext) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordStepStarted(ctx);
		if (this.sessionReplayConsent) {
			this.tcc.recordStepStarted(ctx);
		}
	}

	recordToolStarted(ctx: ToolCallContext) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordToolStarted(ctx);
		if (this.sessionReplayConsent) {
			this.tcc.recordToolStarted(ctx);
		}
	}

	recordTurnFinished(result: ChatResponseResult) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordTurnFinished(result);
		if (this.sessionReplayConsent) {
			this.tcc.recordTurnFinished(result);
		}
	}

	recordTurnError(error: unknown, ctx?: ChatErrorContext) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordTurnError(error, {
			errorClassification: ctx?.classification,
			errorStage: ctx?.stage,
			messagesPersisted: ctx?.messagesPersisted,
			requestId: ctx?.requestId,
		});
		if (this.sessionReplayConsent) {
			this.tcc.recordTurnError(error, {
				errorClassification: ctx?.classification,
				errorStage: ctx?.stage,
				messagesPersisted: ctx?.messagesPersisted,
				requestId: ctx?.requestId,
			});
		}
	}

	recordToolFinished(ctx: ToolCallResultContext) {
		const outcome = getAIToolOutcome(ctx);
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordToolFinished(ctx, outcome);
		if (this.sessionReplayConsent) {
			this.tcc.recordToolFinished(ctx, outcome);
		}
	}

	recordStepFinished(ctx: StepContext) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordStepFinished(ctx);
		if (this.sessionReplayConsent) {
			this.tcc.recordStepFinished(ctx);
		}
	}

	recordChunk(ctx: ChunkContext) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordChunk(ctx);
	}

	recordAuxiliaryGeneration(input: {
		feature: "compaction" | "thread-title";
		gatewayModel: string;
		latencySeconds: number;
		prompt: string;
		text: string;
		providerMetadata?: Record<string, unknown>;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
		usage?: unknown;
	}) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordAuxiliaryGeneration({
			...input,
			captureContent: this.sessionReplayConsent,
			traceContext: this.posthog.getActiveTraceContext(),
		});
		if (this.sessionReplayConsent) {
			this.tcc.recordAuxiliaryGeneration({
				...input,
				env: this.env,
			});
		}
	}

	recordAuxiliaryError(input: {
		error: unknown;
		feature: "chat-recovery" | "compaction" | "thread-title" | "session-prompt-refresh";
		gatewayModel?: string;
		latencySeconds?: number;
		prompt?: string;
		thread: Pick<AIThreadContext, "id" | "workspaceId" | "userId">;
	}) {
		if (!this.analyticsConsent) {
			return;
		}
		this.posthog.recordAuxiliaryError({
			...input,
			captureContent: this.sessionReplayConsent,
			traceContext: this.posthog.getActiveTraceContext(),
		});

		if (this.sessionReplayConsent && isAiGenerationAuxiliaryError(input)) {
			this.tcc.recordAuxiliaryError({
				...input,
				env: this.env,
			});
		}
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
