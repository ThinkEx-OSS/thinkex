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
import { generateText, type LanguageModel, type ToolSet } from "ai";

import {
	AI_THREAD_COMPACTION_SYSTEM_PROMPT,
	createAIThreadCompactFunction,
} from "#/features/workspaces/ai/ai-compaction";
import type { AIInspectorSnapshot } from "#/features/workspaces/ai/ai-inspector";
import { resolveChatAttachmentModelMessages } from "#/features/workspaces/ai/chat-attachment-model";
import type { AIThreadContext } from "#/features/workspaces/ai/ai-thread-metadata";
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
	type WorkspaceAiChatModelId,
} from "#/features/workspaces/ai/models";
import type { UserAIStore } from "#/features/workspaces/ai/user-ai-agents";
import {
	checkWorkspaceAiMessageAccess,
	trackWorkspaceAiMessageUsage,
} from "#/integrations/autumn/workspace-ai-usage";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const AI_THREAD_CHAT_RECOVERY_NO_PROGRESS_TIMEOUT_MS = 90_000;
const AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE =
	"The assistant was interrupted and could not recover this turn.";
const AI_THREAD_CHAT_RECOVERY_REASON_MESSAGES: Record<string, string> = {
	max_attempts_exceeded:
		"The assistant was interrupted repeatedly and could not recover this turn.",
	no_progress_timeout: "The assistant stopped making progress and could not recover this turn.",
	out_of_memory: "The assistant ran out of memory while recovering this turn.",
	recovery_aborted: "The assistant recovery was stopped before this turn could finish.",
	stable_timeout: "The assistant could not reach a stable state while recovering this turn.",
	work_budget_exceeded: "The assistant kept retrying recovery work and could not finish this turn.",
};

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

interface AIThreadUsageContext {
	modelId: WorkspaceAiChatModelId;
	thread: AIThreadContext;
}

export function createAIThreadClass(getUserAIStore: () => typeof UserAIStore) {
	return class AIThread extends Think<Cloudflare.Env> {
		override chatRecovery = {
			noProgressTimeoutMs: AI_THREAD_CHAT_RECOVERY_NO_PROGRESS_TIMEOUT_MS,
			terminalMessage: AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE,
			onExhausted: (ctx: ChatRecoveryExhaustedContext) => {
				return this.keepAliveWhile(() => this._handleChatRecoveryExhausted(ctx));
			},
		} satisfies Exclude<ChatRecoveryConfig, boolean>;
		override chatStreamStallTimeoutMs = 90_000;
		override contextOverflow = { reactive: true } as const;
		override classifyChatError = defaultContextOverflowClassifier;
		override sendReasoning = false;
		private shouldRefreshSessionPrompt = false;
		private activeRunStartedAt: number | undefined;
		private activeUsageContext: AIThreadUsageContext | undefined;
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
					createAIThreadCompactFunction({
						summarize: (prompt) => this._summarizeCompactionPrompt(prompt),
					}),
				)
				.compactAfter(100_000)
				.onCompactionError((error) => {
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

			if (!ctx.continuation) {
				const access = await checkWorkspaceAiMessageAccess({
					env: this.env,
					modelId,
					userId: thread.userId,
				});

				if (!access.allowed) {
					throw new Error("Usage limit reached");
				}

				this.activeUsageContext = {
					modelId,
					thread,
				};
			}

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
			const messages = await resolveChatAttachmentModelMessages({
				bucket: this.env.WORKSPACE_KERNEL_FILES,
				messages: ctx.messages,
				threadId: thread.id,
				userId: thread.userId,
				workspaceId: thread.workspaceId,
			});

			return {
				messages,
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
			this._trackCompletedMessageUsage(result);
			if (!this._shouldSettleRunAfterResponse(result)) {
				await this._refreshSessionPromptIfNeeded();
				return;
			}

			await this._settleActiveRun({ kind: "finished", result });
		}

		override onChatError(error: unknown, ctx?: ChatErrorContext) {
			this.telemetry.recordTurnError(error, ctx);
			void this.keepAliveWhile(async () => {
				await this._settleActiveRun({
					error,
					errorClassification: ctx?.classification,
					errorStage: ctx?.stage,
					kind: "failed",
				});
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

		private async _settleActiveRun(settlement: AIThreadRunSettlement) {
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
			} catch (error) {
				const thread = this.activeUsageContext?.thread;
				recordOperationalFailure({
					distinctId: thread?.userId,
					error,
					event: "ai_directory_settlement",
					fields: {
						settlement_kind: settlement.kind,
						thread_id: this.name,
						user_id: thread?.userId,
						workspace_id: thread?.workspaceId,
					},
				});
			} finally {
				this.activeRunStartedAt = undefined;
				this.activeUsageContext = undefined;
				await this._refreshSessionPromptIfNeeded();
			}
		}

		private _trackCompletedMessageUsage(result: ChatResponseResult) {
			if (result.continuation || result.status !== "completed") {
				return;
			}

			const usageContext = this.activeUsageContext;
			if (!usageContext) {
				return;
			}

			void this.keepAliveWhile(() =>
				trackWorkspaceAiMessageUsage({
					env: this.env,
					modelId: usageContext.modelId,
					threadId: usageContext.thread.id,
					userId: usageContext.thread.userId,
					workspaceId: usageContext.thread.workspaceId,
				}),
			);
		}

		private async _handleChatRecoveryExhausted(ctx: ChatRecoveryExhaustedContext) {
			const errorMessage = getChatRecoveryExhaustedMessage(ctx);

			await this._recordAuxiliaryError({
				error: new Error(errorMessage),
				feature: "chat-recovery",
			});
			await this._settleActiveRun({
				error: errorMessage,
				errorStage: "recovery",
				kind: "failed",
			});
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
					providerOptions: getWorkspaceAiGatewayProviderOptions({
						modelId: DEFAULT_WORKSPACE_AI_CHAT_MODEL_ID,
						tags: ["task:compaction"],
					}),
					prompt,
					system: AI_THREAD_COMPACTION_SYSTEM_PROMPT,
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
			let thread: AIThreadContext | null = null;
			try {
				thread = await this._getThreadContext();
			} catch (error) {
				recordOperationalFailure({
					error,
					event: "ai_auxiliary_context",
					fields: {
						feature: input.feature,
						thread_id: this.name,
					},
				});
			}

			if (!thread) {
				recordOperationalFailure({
					error: input.error,
					event: "ai_auxiliary",
					fields: {
						feature: input.feature,
						thread_id: this.name,
					},
				});
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

function getChatRecoveryExhaustedMessage(ctx: ChatRecoveryExhaustedContext) {
	return (
		AI_THREAD_CHAT_RECOVERY_REASON_MESSAGES[ctx.reason] ??
		ctx.terminalMessage ??
		AI_THREAD_CHAT_RECOVERY_TERMINAL_MESSAGE
	);
}
