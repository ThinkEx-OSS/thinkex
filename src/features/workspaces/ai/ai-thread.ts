import type {
	ChatErrorClassification,
	ChatErrorContext,
	ChatRecoveryConfig,
	ChatRecoveryExhaustedContext,
	ChatResponseResult,
	ChunkContext,
	PrepareStepContext,
	Session,
	StepConfig,
	StepContext,
	ToolCallContext,
	ToolCallDecision,
	ToolCallResultContext,
	TurnConfig,
	TurnContext,
} from "@cloudflare/think";
import { defaultContextOverflowClassifier, Think } from "@cloudflare/think";
import { createCompactFunction } from "agents/experimental/memory/utils";
import { generateText, type LanguageModel, type ToolSet } from "ai";

import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import { AIThreadTelemetryRecorder } from "#/features/workspaces/ai/ai-thread-telemetry-recorder";
import {
	createAIThreadTools,
	createAIThreadTurnToolConfig,
	generateAIThreadTitle,
	getAIThreadSoulPrompt,
	getAIThreadSystemPromptForWorkspace,
	getWorkspaceAiGatewayProviderOptions,
	getWorkspaceAiLanguageModel,
} from "#/features/workspaces/ai/ai-thread-runtime";
import {
	DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
	getWorkspaceAiChatModel,
	resolveWorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import type { UserAIStore } from "#/features/workspaces/ai/user-ai-agents";

const AI_THREAD_CHAT_RECOVERY_NO_PROGRESS_TIMEOUT_MS = 90_000;
const AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE =
	"The assistant was interrupted and could not recover this turn.";

type AIThreadRunSettlement =
	| {
			kind: "finished";
			result: ChatResponseResult;
	  }
	| {
			error: unknown;
			errorClassification?: ChatErrorClassification;
			errorStage?: ChatErrorContext["stage"];
			kind: "failed";
	  };

export function createAIThreadClass(getUserAIStore: () => typeof UserAIStore) {
	return class AIThread extends Think<Cloudflare.Env> {
		override chatRecovery = {
			noProgressTimeoutMs: AI_THREAD_CHAT_RECOVERY_NO_PROGRESS_TIMEOUT_MS,
			terminalMessage: AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE,
			onExhausted: (ctx: ChatRecoveryExhaustedContext) => {
				console.warn("[AIThread] Chat recovery exhausted", {
					incidentId: ctx.incidentId,
					reason: ctx.reason,
					recoveryKind: ctx.recoveryKind,
					requestId: ctx.requestId,
				});

				return this.keepAliveWhile(() => this._handleChatRecoveryExhausted(ctx));
			},
		} satisfies Exclude<ChatRecoveryConfig, boolean>;
		override chatStreamStallTimeoutMs = 90_000;
		override contextOverflow = { reactive: true } as const;
		override classifyChatError = defaultContextOverflowClassifier;
		override sendReasoning = false;
		private shouldRefreshSessionPrompt = false;
		private activeRunStartedAt: number | undefined;
		private readonly telemetry = new AIThreadTelemetryRecorder({
			env: this.env,
			host: this,
			schedule: (task) => {
				void this.keepAliveWhile(() => task);
			},
		});

		getModel(): LanguageModel {
			// Think requires a base model before `beforeTurn` runs. Normal UI sends
			// override this per request with the selected model from `ctx.body.modelId`.
			return getWorkspaceAiLanguageModel(
				DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
				this.env,
				this.sessionAffinity,
			);
		}

		getSystemPrompt(): string {
			return getAIThreadSoulPrompt();
		}

		configureSession(session: Session) {
			return session
				.withContext("soul", {
					provider: {
						get: async () => getAIThreadSoulPrompt(),
					},
				})
				.withContext("memory", {
					description:
						"Short durable facts about this user, workspace, thread goals, preferences, and decisions that should help future turns. Keep this concise. Do not store source-of-truth workspace content here.",
					maxTokens: 1500,
				})
				.onCompaction(
					createCompactFunction({
						summarize: (prompt) => this._summarizeCompactionPrompt(prompt),
					}),
				)
				.compactAfter(100_000)
				.onCompactionError((error) => {
					console.warn("[AIThread] Session compaction failed", error);
					void this.keepAliveWhile(() =>
						this._recordAuxiliaryError({
							error,
							feature: "compaction",
						}),
					);
				})
				.withCachedPrompt();
		}

		getTools(): ToolSet {
			return createAIThreadTools({
				env: this.env,
				threadId: this.name,
				workspace: this.workspace,
				getThreadContext: () => this._getThreadContext(),
			});
		}

		async beforeTurn(ctx: TurnContext): Promise<TurnConfig | undefined> {
			const directory = await this.parentAgent(getUserAIStore());
			const thread = await directory.getThreadContext(this.name);

			if (!thread) {
				throw new Error("Chat thread not found");
			}

			if (!ctx.continuation) {
				this.activeRunStartedAt = await directory.recordThreadRunStarted(this.name, {
					isUserMessage: true,
				});

				void this.keepAliveWhile(() => this._maybeGenerateThreadTitle());
			}

			const modelId = resolveWorkspaceAiChatModelId(ctx.body?.modelId);
			const system = getAIThreadSystemPromptForWorkspace(ctx.system, thread.promptScope, {
				timeZone: getBodyString(ctx.body, "timeZone"),
				workspaceAiContext: ctx.body?.workspaceAiContext,
			});
			const turnToolConfig = createAIThreadTurnToolConfig({
				env: this.env,
				ctx: this.ctx,
				threadId: this.name,
				workspace: this.workspace,
				getThreadContext: () => this._getThreadContext(),
				canMutate: thread.promptScope.canMutate,
				timeZone: getBodyString(ctx.body, "timeZone"),
			});
			const activeTools = filterToolSetByNames(
				{ ...ctx.tools, ...turnToolConfig.tools },
				turnToolConfig.activeTools,
			);

			await this.telemetry.recordTurnStarted({
				ctx,
				modelId,
				system,
				thread,
				tools: activeTools,
			});

			return {
				model: getWorkspaceAiLanguageModel(modelId, this.env, this.sessionAffinity),
				providerOptions: getWorkspaceAiGatewayProviderOptions({
					modelId,
					thread,
				}),
				system,
				...turnToolConfig,
			};
		}

		beforeStep(ctx: PrepareStepContext): StepConfig | undefined {
			this.telemetry.recordStepStarted(ctx);

			return undefined;
		}

		beforeToolCall(ctx: ToolCallContext): ToolCallDecision | undefined {
			this.telemetry.recordToolStarted(ctx);

			return undefined;
		}

		override async onChatResponse(result: ChatResponseResult) {
			this.telemetry.recordTurnFinished(result);
			if (!this._shouldSettleRunAfterResponse(result)) {
				await this._refreshSessionPromptIfNeeded();
				return;
			}

			await this._settleActiveRun({ kind: "finished", result }, (error) => {
				console.warn("[AIThread] Failed to update directory", error);
			});
		}

		override onChatError(error: unknown, ctx?: ChatErrorContext) {
			this.telemetry.recordTurnError(error, ctx);
			void this.keepAliveWhile(async () => {
				await this._settleActiveRun(
					{
						error,
						errorClassification: ctx?.classification,
						errorStage: ctx?.stage,
						kind: "failed",
					},
					(metadataError) => {
						console.warn("[AIThread] Failed to clear directory run status", metadataError);
					},
				);
			});

			return super.onChatError(error, ctx);
		}

		afterToolCall(ctx: ToolCallResultContext): void {
			this.telemetry.recordToolFinished(ctx);

			if (ctx.success && ctx.toolName === "set_context") {
				this.shouldRefreshSessionPrompt = true;
			}
		}

		onStepFinish(ctx: StepContext): void {
			this.telemetry.recordStepFinished(ctx);
		}

		onChunk(ctx: ChunkContext): void {
			this.telemetry.recordChunk(ctx);
		}

		getInspectorSnapshot(): AIInspectorSnapshot {
			return this.telemetry.getInspectorSnapshot(this.name);
		}

		private async _getThreadContext() {
			const directory = await this.parentAgent(getUserAIStore());
			return directory.getThreadContext(this.name);
		}

		private _shouldSettleRunAfterResponse(result: ChatResponseResult) {
			return !result.continuation || result.status === "error" || result.status === "aborted";
		}

		private _hasActiveConnections() {
			return Array.from(this.getConnections()).length > 0;
		}

		private async _getActiveRunStartedAt() {
			if (this.activeRunStartedAt !== undefined) {
				return this.activeRunStartedAt;
			}

			const directory = await this.parentAgent(getUserAIStore());
			const startedAt = await directory.getThreadRunStartedAt(this.name);
			this.activeRunStartedAt = startedAt;
			return startedAt;
		}

		private async _settleActiveRun(
			settlement: AIThreadRunSettlement,
			onError: (error: unknown) => void,
		) {
			try {
				const startedAt = await this._getActiveRunStartedAt();

				if (startedAt === undefined) {
					return;
				}

				const directory = await this.parentAgent(getUserAIStore());
				const viewed = this._hasActiveConnections();

				if (settlement.kind === "finished") {
					await directory.recordThreadRunFinished(this.name, settlement.result, {
						startedAt,
						viewed,
						errorMessage: settlement.result.error,
					});
				} else {
					await directory.recordThreadRunFailed(this.name, settlement.error, {
						errorClassification: settlement.errorClassification,
						errorStage: settlement.errorStage,
						startedAt,
						viewed,
					});
				}

				this.activeRunStartedAt = undefined;
			} catch (error) {
				onError(error);
			} finally {
				await this._refreshSessionPromptIfNeeded();
			}
		}

		private async _handleChatRecoveryExhausted(ctx: ChatRecoveryExhaustedContext) {
			await this._recordAuxiliaryError({
				error: new Error(AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE),
				feature: "chat-recovery",
			});
			await this._settleActiveRun(
				{
					error: AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE,
					errorStage: "recovery",
					kind: "failed",
				},
				(error) => {
					console.warn("[AIThread] Failed to record recovery exhaustion", error, {
						incidentId: ctx.incidentId,
						reason: ctx.reason,
						recoveryKind: ctx.recoveryKind,
						requestId: ctx.requestId,
					});
				},
			);
		}

		private async _summarizeCompactionPrompt(prompt: string) {
			const startedAt = Date.now();
			const gatewayModel = getWorkspaceAiChatModel(DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID);
			let result: Awaited<ReturnType<typeof generateText>>;

			try {
				result = await generateText({
					model: getWorkspaceAiLanguageModel(
						DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
						this.env,
						this.sessionAffinity,
					),
					prompt,
				});
			} catch (error) {
				await this._recordAuxiliaryError({
					error,
					feature: "compaction",
					gatewayModel,
					latencySeconds: (Date.now() - startedAt) / 1000,
					prompt,
				});
				throw error;
			}

			const thread = await this._getThreadContext();

			if (thread) {
				this.telemetry.recordAuxiliaryGeneration({
					feature: "compaction",
					gatewayModel,
					prompt,
					text: result.text,
					usage: result.usage,
					latencySeconds: (Date.now() - startedAt) / 1000,
					thread,
				});
			}

			return result.text;
		}

		private async _maybeGenerateThreadTitle() {
			const directory = await this.parentAgent(getUserAIStore());

			if (!(await directory.shouldGenerateThreadTitle(this.name))) {
				return;
			}

			try {
				const titleResult = await generateAIThreadTitle({
					env: this.env,
					messages: await this.getMessages(),
				});
				const thread = await this._getThreadContext();

				if (titleResult && thread) {
					this.telemetry.recordAuxiliaryGeneration({
						feature: "thread-title",
						gatewayModel: titleResult.gatewayModel,
						prompt: titleResult.prompt,
						text: titleResult.title,
						usage: titleResult.usage,
						latencySeconds: titleResult.latencySeconds,
						thread,
					});
				}

				await directory.recordGeneratedThreadTitle(this.name, titleResult?.title);
			} catch (error) {
				console.warn("[AIThread] Failed to generate title", error);
				await this._recordAuxiliaryError({
					error,
					feature: "thread-title",
				});
			}
		}

		private async _refreshSessionPromptIfNeeded() {
			if (!this.shouldRefreshSessionPrompt) {
				return;
			}

			this.shouldRefreshSessionPrompt = false;

			try {
				await this.session.refreshSystemPrompt();
			} catch (error) {
				console.warn("[AIThread] Failed to refresh session prompt", error);
				await this._recordAuxiliaryError({
					error,
					feature: "session-prompt-refresh",
				});
			}
		}

		private async _recordAuxiliaryError(input: {
			error: unknown;
			feature: "chat-recovery" | "compaction" | "thread-title" | "session-prompt-refresh";
			gatewayModel?: string;
			latencySeconds?: number;
			prompt?: string;
		}) {
			const thread = await this._getThreadContext().catch(() => null);

			if (!thread) {
				return;
			}

			this.telemetry.recordAuxiliaryError({
				error: input.error,
				feature: input.feature,
				gatewayModel: input.gatewayModel,
				latencySeconds: input.latencySeconds,
				prompt: input.prompt,
				thread,
			});
		}
	};
}

function filterToolSetByNames(tools: ToolSet, activeToolNames: string[] | undefined): ToolSet {
	if (!activeToolNames) {
		return tools;
	}

	return Object.fromEntries(
		activeToolNames
			.map((name) => [name, tools[name]] as const)
			.filter((entry) => entry[1] !== undefined),
	) as ToolSet;
}

function getBodyString(body: Record<string, unknown> | undefined, key: string) {
	const value = body?.[key];
	return typeof value === "string" ? value : undefined;
}
