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
import { Think } from "@cloudflare/think";
import bundledSkills from "agents:skills";
import { callable } from "agents";
import { generateText, type LanguageModel, type ToolSet } from "ai";

import {
	createAIThreadBrowserConnector,
	getAIThreadBrowserHandoff,
	getAIThreadBrowserPresence,
	getAIThreadBrowserLiveView,
	type AIThreadBrowserLiveView,
	type AIThreadBrowserState,
} from "#/features/workspaces/ai/ai-thread-browser";
import {
	AI_THREAD_COMPACTION_SYSTEM_PROMPT,
	AI_THREAD_COMPACTION_TOKEN_THRESHOLD,
	createAIThreadCompactFunction,
} from "#/features/workspaces/ai/ai-compaction";
import {
	collectWorkspaceReferenceRecords,
	reconcileWorkspaceMessageCitations,
} from "#/features/workspaces/ai/workspace-citations";
import { resolveChatAttachmentModelMessages } from "#/features/workspaces/ai/chat-attachment-model";
import { classifyAIThreadChatError } from "#/features/workspaces/ai/chat-error-classification";
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
import type { WorkspaceReferenceRecord } from "#/features/workspaces/locations/workspace-location";
import {
	checkWorkspaceAiMessageAccess,
	trackWorkspaceAiMessageUsage,
} from "#/integrations/autumn/workspace-ai-usage";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getAppOrigin } from "#/lib/app-origin";

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
		override classifyChatError = classifyAIThreadChatError;
		override sendReasoning = false;
		override modelMessageUrlBase = getAppOrigin();
		private shouldRefreshSessionPrompt = false;
		private activeRunStartedAt: number | undefined;
		private activeUsageContext: AIThreadUsageContext | undefined;
		private activeWorkspaceReferences: WorkspaceReferenceRecord[] = [];
		private readonly telemetry = new AIThreadTelemetryRecorder({
			env: this.env,
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

		// On-demand instruction bundles (progressive disclosure). The model sees
		// only each skill's name/description until a task matches, then calls
		// activate_skill to load the full guide. Bundled from ./skills via the
		// agents Vite plugin (agents:skills virtual module).
		getSkills() {
			return [bundledSkills];
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
				.compactAfter(AI_THREAD_COMPACTION_TOKEN_THRESHOLD)
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
				onWorkspaceReferences: (records) => {
					this._recordWorkspaceReferences(records);
				},
				resolveWorkspaceReferences: (refs) => this._resolveWorkspaceReferences(refs),
			});
		}

		/**
		 * Everything the chat's browser card polls for, in one call: the card
		 * needs presence and handoff together to decide what it shows, and
		 * narrowing the handoff here keeps every other pending action's raw
		 * arguments off the wire.
		 */
		@callable()
		async getBrowserState(): Promise<AIThreadBrowserState> {
			const [handoff, presence] = await Promise.all([
				this._getBrowserHandoff(),
				getAIThreadBrowserPresence(this.ctx.storage),
			]);
			return { handoff, presence };
		}

		@callable()
		async getBrowserLiveView(): Promise<AIThreadBrowserLiveView | null> {
			return getAIThreadBrowserLiveView(this._browserConnector());
		}

		@callable()
		async resolveBrowserHandoff(executionId: string, approved: boolean): Promise<void> {
			await this._resolveBrowserHandoff(
				executionId,
				approved,
				"The user could not complete the requested browser handoff.",
			);
		}

		@callable()
		async stopBrowserSession(): Promise<void> {
			await this._endBrowserSession("Browser handoff was stopped by the user.");
		}

		async beforeTurn(ctx: TurnContext): Promise<TurnConfig | undefined> {
			// Consent travels in the chat body because the DO can't see the browser cookie.
			this.telemetry.setConsent({
				analytics: ctx.body?.analyticsConsent === true,
				sessionReplay: ctx.body?.sessionReplayConsent === true,
			});

			const directory = await this.parentAgent(getUserAIStore());
			const thread = await directory.getThreadContext(this.name);

			if (!thread) {
				throw new Error("Chat thread not found");
			}

			if (!ctx.continuation) {
				this.activeWorkspaceReferences = [];
				this.activeRunStartedAt = await directory.recordThreadRunStarted(this.name, {
					isUserMessage: true,
				});

				void this.keepAliveWhile(() => this._maybeGenerateThreadTitle());
			}

			let modelId = resolveWorkspaceAiChatModelId(ctx.body?.modelId);

			if (ctx.continuation) {
				// A continuation resumes a turn that was already gated on its first
				// step, and possibly downgraded there. The body still carries whatever
				// the user picked, so re-reading it would put the rejected model back
				// for every tool round-trip after the first — running on a tier with no
				// balance and billing it as the model the gate actually allowed.
				modelId = this.activeUsageContext?.modelId ?? modelId;
			} else {
				const access = await checkWorkspaceAiMessageAccess({
					env: this.env,
					modelId,
					userId: thread.userId,
				});

				if (!access.allowed) {
					// Carries the reset date because this is the stale-client backstop:
					// the composer warns before sending, so anyone who reaches here got
					// no warning and an unexplained failure would be the whole story.
					// ISO date rather than a locale format — this is formatted on the
					// server, which has no idea where the reader is.
					throw new Error(
						access.resetsAt
							? `Usage limit reached. Resets ${new Date(access.resetsAt).toISOString().slice(0, 10)}.`
							: "Usage limit reached.",
					);
				}

				// May differ from what was selected: an empty tier falls through to the
				// other one rather than failing the turn.
				modelId = access.modelId;

				this.activeUsageContext = {
					modelId,
					thread,
				};
			}

			const instructions = getAIThreadSystemPromptForWorkspace(ctx.system, thread.promptScope, {
				timeZone: getBodyString(ctx.body, "timeZone"),
				workspaceAiContext: ctx.body?.workspaceAiContext,
			});
			const turnToolConfig = this._createTurnToolConfig(
				thread,
				getBodyString(ctx.body, "timeZone"),
			);
			const activeToolNames = [
				...turnToolConfig.activeTools,
				...["activate_skill", "read_skill_resource", "run_skill_script"].filter(
					(name) => ctx.tools[name] !== undefined,
				),
			];
			const activeTools = filterToolSetByNames(
				{ ...ctx.tools, ...turnToolConfig.tools },
				activeToolNames,
			);

			this.telemetry.recordTurnStarted({
				ctx,
				modelId,
				instructions,
				thread,
				tools: activeTools,
			});
			const messages = await resolveChatAttachmentModelMessages({
				bucket: this.env.WORKSPACE_FILES,
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
				instructions,
				...turnToolConfig,
				activeTools: activeToolNames,
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
			if (result.status === "completed") {
				await this._reconcileWorkspaceCitations(result.message);
			}
			if (!this._shouldSettleRunAfterResponse(result)) {
				await this._refreshSessionPromptIfNeeded();
				return;
			}

			if (result.status !== "completed") {
				await this._cleanupBrowserSession(
					result.status === "aborted" ? "turn_aborted" : "turn_failed",
				);
			}
			await this._settleActiveRun({ kind: "finished", result });
		}

		override onChatError(error: unknown, ctx?: ChatErrorContext) {
			this.telemetry.recordTurnError(error, ctx);
			void this.keepAliveWhile(async () => {
				await this._cleanupBrowserSession("turn_failed");
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

		private async _getThreadContext() {
			const directory = await this.parentAgent(getUserAIStore());
			return directory.getThreadContext(this.name);
		}

		private _createTurnToolConfig(thread: AIThreadContext, timeZone?: string) {
			return createAIThreadTurnToolConfig({
				env: this.env,
				ctx: this.ctx,
				threadId: this.name,
				workspace: this.workspace,
				getThreadContext: () => this._getThreadContext(),
				canMutate: thread.promptScope.canMutate,
				onOrchestrationRuntime: (runtime) => {
					this.codemode = runtime;
				},
				onWorkspaceReferences: (records) => {
					this._recordWorkspaceReferences(records);
				},
				timeZone,
			});
		}

		private async _ensureOrchestrationRuntime() {
			if (this.codemode) {
				return;
			}

			const thread = await this._getThreadContext();
			if (!thread) {
				throw new Error("Chat thread not found");
			}

			this._createTurnToolConfig(thread);
		}

		private async _getBrowserHandoff(executionId?: string) {
			await this._ensureOrchestrationRuntime();
			return getAIThreadBrowserHandoff(await super.pendingExecutions(executionId));
		}

		private async _resolveBrowserHandoff(
			executionId: string,
			approved: boolean,
			rejectionReason: string,
		) {
			const handoff = await this._getBrowserHandoff(executionId);
			if (!handoff || handoff.executionId !== executionId) {
				throw new Error("The browser handoff is no longer waiting for input.");
			}

			const result = approved
				? await super.approveExecution(executionId)
				: await super.rejectExecution(executionId, rejectionReason);
			assertAIThreadExecutionResolved(result);
		}

		private _browserConnector() {
			return createAIThreadBrowserConnector(this.ctx, this.env.BROWSER);
		}

		/**
		 * Ending a session always resolves whatever handoff it parked. Leaving one
		 * pending keeps the chat polling and offering "Done, continue" for a run
		 * whose browser is already gone, and the agent is the only party that can
		 * name the pending execution without racing its own poll.
		 */
		private async _endBrowserSession(rejectionReason: string) {
			try {
				const handoff = await this._getBrowserHandoff();
				if (handoff) {
					await this._resolveBrowserHandoff(handoff.executionId, false, rejectionReason);
				}
			} finally {
				await this._browserConnector().closeSession();
			}
		}

		private async _cleanupBrowserSession(reason: "turn_aborted" | "turn_failed") {
			try {
				await this._endBrowserSession(
					reason === "turn_aborted"
						? "The run was stopped before the browser handoff could be completed."
						: "The run failed before the browser handoff could be completed.",
				);
			} catch (error) {
				recordOperationalFailure({
					error,
					event: "ai_browser_cleanup",
					fields: {
						reason,
						thread_id: this.name,
					},
				});
			}
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
				this.activeWorkspaceReferences = [];
				await this._refreshSessionPromptIfNeeded();
			}
		}

		private _recordWorkspaceReferences(records: readonly WorkspaceReferenceRecord[]) {
			this.activeWorkspaceReferences.push(...records);
		}

		/**
		 * Looks up the refs a read handed the assistant, so a tool can turn one
		 * into the location it stands for. Reads from this turn are not in the
		 * transcript yet, which is exactly when a document usually cites them.
		 */
		private async _resolveWorkspaceReferences(refs: readonly string[]) {
			const wanted = new Set(refs);
			const records = [
				...collectWorkspaceReferenceRecords(await this.getMessages()),
				...this.activeWorkspaceReferences,
			];

			return records.filter((record) => wanted.has(record.ref));
		}

		private async _reconcileWorkspaceCitations(message: ChatResponseResult["message"]) {
			try {
				const transcriptReferences = collectWorkspaceReferenceRecords(await this.getMessages());
				const reconciled = reconcileWorkspaceMessageCitations(message, [
					...transcriptReferences,
					...this.activeWorkspaceReferences,
				]);

				if (reconciled !== message) {
					await this.addMessages([reconciled], { mode: "upsert" });
				}
			} catch (error) {
				const thread = this.activeUsageContext?.thread;
				recordOperationalFailure({
					distinctId: thread?.userId,
					error,
					event: "ai_citation_finalization",
					fields: {
						thread_id: this.name,
						user_id: thread?.userId,
						workspace_id: thread?.workspaceId,
					},
				});
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
					instructions: AI_THREAD_COMPACTION_SYSTEM_PROMPT,
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
					providerMetadata: result.providerMetadata,
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
						providerMetadata: titleResult.providerMetadata,
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

function assertAIThreadExecutionResolved(result: unknown) {
	if (result && typeof result === "object" && "status" in result && result.status === "error") {
		const message =
			"error" in result && typeof result.error === "string" ? result.error : undefined;
		throw new Error(message ?? "The browser handoff could not be resolved.");
	}
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
