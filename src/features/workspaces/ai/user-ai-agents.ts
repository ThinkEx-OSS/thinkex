import type { ChatResponseResult } from "@cloudflare/think";
import { Agent, callable, getAgentByName } from "agents";
import type { UIMessage } from "ai";
import { nanoid } from "nanoid";

import { aiThreadAgentName, userAIAgentName } from "#/features/workspaces/agent-routes";
import {
	type AIInspectorSnapshot,
	isAIInspectorEnabled,
} from "#/features/workspaces/ai/ai-inspector";
import { createAIThreadClass } from "#/features/workspaces/ai/ai-thread";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import {
	copyChatAttachmentsForThread,
	deleteChatAttachmentsForThread,
	getChatAttachmentObjectKey,
	rebindChatAttachmentMessageUrls,
} from "#/features/workspaces/ai/chat-attachment-storage";
import {
	deleteThreadMeta,
	deleteLinkedThreadImport,
	ensureChatMetaStore,
	getActiveThreadMetaRows,
	getLinkedThreadImport,
	insertLinkedThreadImport,
	insertThreadMeta,
	insertThreadMetaRow,
	markGeneratedThreadTitle,
	markThreadMetaViewed,
	markThreadRunFailed,
	markThreadRunFinished,
	markThreadRunStarted,
} from "#/features/workspaces/ai/ai-thread-directory-store";
import { getWorkspaceIdFromDefaultThreadId } from "#/features/workspaces/ai/ai-thread-identity";
import {
	type AIThreadContext,
	type AIThreadMetaRow,
	type AIThreadSummary,
	compareThreadRecentFirst,
	getThreadTitle,
	mapThreadMetaRow,
	normalizeGeneratedThreadTitle,
	normalizeThreadErrorMessage,
	type UserAIStoreState,
} from "#/features/workspaces/ai/ai-thread-metadata";
import { getWorkspacePromptScope } from "#/features/workspaces/ai/ai-thread-prompt-scope";
import {
	logOperationalEvent,
	recordOperationalFailure,
} from "#/integrations/observability/operational-events";

export type {
	AIThreadSummary,
	UserAIStoreState,
} from "#/features/workspaces/ai/ai-thread-metadata";

class AIThreadNotFoundError extends Error {
	constructor() {
		super("Chat thread not found");
	}
}

class AIThreadForbiddenError extends Error {
	constructor() {
		super("Forbidden");
	}
}

interface LinkedAIThreadSnapshot {
	messages: UIMessage[];
	meta: AIThreadMetaRow;
}

interface LinkedUserAIStore {
	exportForAccountLinking(): Promise<LinkedAIThreadSnapshot[]>;
	purgeForDeletion(): Promise<ResourcePurgeResult>;
}

export interface PutChatAttachmentInput {
	attachmentId: string;
	bytes: ArrayBuffer;
	contentType: string;
	threadId: string;
	workspaceId: string;
}

export const AIThread = createAIThreadClass(() => UserAIStore);

export class UserAIStore extends Agent<Cloudflare.Env, UserAIStoreState> {
	// PartyServer selects its connection manager from the raw subclass options,
	// before the Agents SDK fills its defaults. Keep hibernation explicit here.
	static options = { hibernate: true, sendIdentityOnConnect: false };

	initialState: UserAIStoreState = { isLoaded: false, threads: [] };

	onStart() {
		const startedAt = performance.now();
		let stage: "schema" | "state_refresh" = "schema";

		try {
			ensureChatMetaStore(this);
			stage = "state_refresh";
			const { registeredThreadCount, visibleThreadCount } = this._refreshState();

			logOperationalEvent({
				event: "user_ai_store_start",
				fields: {
					duration_ms: Math.round(performance.now() - startedAt),
					hibernation_enabled: UserAIStore.options.hibernate,
					registered_thread_count: registeredThreadCount,
					visible_thread_count: visibleThreadCount,
				},
				outcome: "success",
			});
		} catch (error) {
			recordOperationalFailure({
				error,
				event: "user_ai_store_start",
				fields: {
					duration_ms: Math.round(performance.now() - startedAt),
					hibernation_enabled: UserAIStore.options.hibernate,
					stage,
				},
			});
			throw error;
		}
	}

	override async onBeforeSubAgent(
		_request: Request,
		{ className, name }: { className: string; name: string },
	): Promise<Request | Response | undefined> {
		if (className !== aiThreadAgentName) {
			return new Response("Chat thread not found", { status: 404 });
		}

		try {
			await this._requireThreadMetaOrEnsureDefault(name);
		} catch (error) {
			if (error instanceof AIThreadForbiddenError) {
				return new Response("Forbidden", { status: 403 });
			}
			return new Response("Chat thread not found", { status: 404 });
		}
	}

	@callable()
	async createThread(input: { workspaceId: string }): Promise<AIThreadSummary> {
		return this._createThread(input);
	}

	private async _createThread(input: { workspaceId: string }): Promise<AIThreadSummary> {
		const workspaceId = input.workspaceId.trim();

		if (!workspaceId) {
			throw new Error("workspaceId is required");
		}

		await getWorkspacePromptScope({
			userId: this.name,
			workspaceId,
		});

		return this._createThreadRecord(workspaceId);
	}

	private async _createThreadRecord(workspaceId: string): Promise<AIThreadSummary> {
		const id = nanoid(12);
		const now = Date.now();
		const title = getThreadTitle();

		await this.subAgent(AIThread, id);

		return this._insertThreadRecord({
			id,
			workspaceId,
			title,
			now,
		});
	}

	private async _ensureDefaultWorkspaceThread(threadId: string): Promise<AIThreadSummary | null> {
		const workspaceId = getWorkspaceIdFromDefaultThreadId(threadId);

		if (!workspaceId) {
			return null;
		}

		await getWorkspacePromptScope({
			userId: this.name,
			workspaceId,
		}).catch(() => {
			throw new AIThreadForbiddenError();
		});

		const existing = this._getThreadSummary(threadId);
		if (existing) {
			return existing;
		}

		const hadSubAgent = this.hasSubAgent(AIThread, threadId);
		if (!hadSubAgent) {
			await this.subAgent(AIThread, threadId);
		}

		const competingThread = this._getThreadSummary(threadId);
		if (competingThread) {
			return competingThread;
		}

		try {
			return this._insertThreadRecord(
				{
					id: threadId,
					workspaceId,
					title: getThreadTitle(),
					now: Date.now(),
				},
				{ cleanupSubAgentOnError: false },
			);
		} catch (error) {
			const createdByCompetingRequest = this._getThreadSummary(threadId);
			if (createdByCompetingRequest) {
				return createdByCompetingRequest;
			}

			if (!hadSubAgent) {
				await this.deleteSubAgent(AIThread, threadId);
			}

			throw error;
		}
	}

	private async _insertThreadRecord(
		input: {
			id: string;
			workspaceId: string;
			title: string;
			now: number;
		},
		options: { cleanupSubAgentOnError?: boolean } = {},
	): Promise<AIThreadSummary> {
		try {
			insertThreadMeta(this, input);
		} catch (error) {
			if (options.cleanupSubAgentOnError !== false) {
				await this.deleteSubAgent(AIThread, input.id);
			}
			throw error;
		}

		this._refreshState();
		const created = this._getThreadSummary(input.id);

		if (!created) {
			throw new Error("Failed to create chat thread");
		}

		return created;
	}

	@callable()
	async markThreadViewed(threadId: string): Promise<void> {
		await this._requireThreadMeta(threadId);

		const now = Date.now();

		markThreadMetaViewed(this, threadId, now);
		this._refreshState();
	}

	@callable()
	async deleteThread(threadId: string): Promise<void> {
		const thread = await this._requireThreadMeta(threadId);
		await this.deleteSubAgent(AIThread, threadId);
		deleteThreadMeta(this, threadId);
		this._refreshState();
		this.ctx.waitUntil(
			deleteChatAttachmentsForThread(this.env.WORKSPACE_KERNEL_FILES, {
				threadId,
				userId: this.name,
				workspaceId: thread.workspace_id,
			}).catch((error) => {
				console.error("Failed to delete chat attachments for deleted thread", error);
			}),
		);
	}

	@callable()
	async purgeForDeletion(): Promise<ResourcePurgeResult> {
		const threads = this._getActiveThreadMetaRows();
		let failed = 0;

		for (const thread of threads) {
			try {
				await deleteChatAttachmentsForThread(this.env.WORKSPACE_KERNEL_FILES, {
					threadId: thread.id,
					userId: this.name,
					workspaceId: thread.workspace_id,
				});

				if (this.hasSubAgent(AIThread, thread.id)) {
					await this.deleteSubAgent(AIThread, thread.id);
				}

				deleteThreadMeta(this, thread.id);
			} catch {
				failed += 1;
			}
		}

		this._refreshState();
		if (failed === 0) {
			await this.ctx.storage.deleteAll();
		}
		return { attempted: threads.length + 1, failed };
	}

	@callable()
	async putChatAttachment(input: PutChatAttachmentInput): Promise<void> {
		const thread = await this._requireThreadMeta(input.threadId);
		if (thread.workspace_id !== input.workspaceId) {
			throw new AIThreadForbiddenError();
		}

		await this.env.WORKSPACE_KERNEL_FILES.put(
			getChatAttachmentObjectKey({
				attachmentId: input.attachmentId,
				threadId: input.threadId,
				userId: this.name,
				workspaceId: input.workspaceId,
			}),
			input.bytes,
			{ httpMetadata: { contentType: input.contentType } },
		);
	}

	async mergeLinkedAnonymousUser(input: { anonymousUserId: string }): Promise<void> {
		if (input.anonymousUserId === this.name) {
			return;
		}

		const anonymousStore = getAgentByName(
			this.env[userAIAgentName],
			input.anonymousUserId,
		) as unknown as LinkedUserAIStore;
		const snapshots = await anonymousStore.exportForAccountLinking();

		for (const snapshot of snapshots) {
			await this._importLinkedThread({
				snapshot,
				sourceUserId: input.anonymousUserId,
			});
		}

		await anonymousStore.purgeForDeletion();
	}

	async exportForAccountLinking(): Promise<LinkedAIThreadSnapshot[]> {
		const snapshots: LinkedAIThreadSnapshot[] = [];

		for (const meta of this._getActiveThreadMetaRows()) {
			if (!this.hasSubAgent(AIThread, meta.id)) {
				continue;
			}

			const thread = await this.subAgent(AIThread, meta.id);
			snapshots.push({
				messages: await thread.getMessages(),
				meta: this._normalizeLinkedThreadMeta(meta),
			});
		}

		return snapshots;
	}

	@callable()
	async getThreadInspectorSnapshot(threadId: string): Promise<AIInspectorSnapshot> {
		if (!isAIInspectorEnabled()) {
			return { isEnabled: false, threadId, events: [] };
		}

		await this._requireThreadMeta(threadId);

		const thread = await this.subAgent(AIThread, threadId);
		return thread.getInspectorSnapshot();
	}

	async getThreadContext(threadId: string): Promise<AIThreadContext | null> {
		try {
			const thread = await this._requireThreadMetaOrEnsureDefault(threadId);
			const promptScope = await getWorkspacePromptScope({
				workspaceId: thread.workspace_id,
				userId: this.name,
			});

			return {
				id: thread.id,
				workspaceId: thread.workspace_id,
				promptScope,
				userId: this.name,
			};
		} catch {
			return null;
		}
	}

	async shouldGenerateThreadTitle(threadId: string): Promise<boolean> {
		const thread = await this._requireThreadMeta(threadId);
		return thread.title_generated_at === null;
	}

	async getThreadRunStartedAt(threadId: string): Promise<number | undefined> {
		const thread = await this._requireThreadMeta(threadId);
		return thread.status === "running" ? (thread.last_run_started_at ?? undefined) : undefined;
	}

	async recordThreadRunStarted(
		threadId: string,
		input: { isUserMessage: boolean },
	): Promise<number> {
		const now = Date.now();

		markThreadRunStarted(this, {
			threadId,
			now,
			isUserMessage: input.isUserMessage,
		});
		this._refreshState();
		return now;
	}

	async recordThreadRunFinished(
		threadId: string,
		result: ChatResponseResult,
		options: { startedAt: number; viewed: boolean; errorMessage?: string },
	): Promise<void> {
		const now = Date.now();
		const thread = await this._requireThreadMeta(threadId);

		markThreadRunFinished(this, {
			threadId,
			result: result.status,
			now,
			startedAt: options.startedAt,
			lastAssistantMessageAt:
				result.status === "completed" ? now : thread.last_assistant_message_at,
			lastVisibleUpdateAt: now,
			lastViewedAt: options.viewed ? now : thread.last_viewed_at,
			errorMessage:
				result.status === "error" ? normalizeThreadErrorMessage(options.errorMessage) : null,
			errorClassification: null,
			errorStage: null,
		});
		this._refreshState();
	}

	async recordGeneratedThreadTitle(
		threadId: string,
		generatedTitle: string | undefined,
	): Promise<void> {
		const title = normalizeGeneratedThreadTitle(generatedTitle);

		if (!title) {
			return;
		}

		await this._requireThreadMeta(threadId);

		const now = Date.now();

		markGeneratedThreadTitle(this, threadId, title, now);
		this._refreshState();
	}

	async recordThreadRunFailed(
		threadId: string,
		error?: unknown,
		options: {
			errorClassification?: AIThreadMetaRow["last_error_classification"];
			errorStage?: AIThreadMetaRow["last_error_stage"];
			startedAt?: number;
			viewed?: boolean;
		} = {},
	): Promise<void> {
		const now = Date.now();
		const errorMessage = normalizeThreadErrorMessage(error);
		const thread = await this._requireThreadMeta(threadId);

		markThreadRunFailed(this, {
			threadId,
			errorMessage,
			errorClassification: options.errorClassification ?? null,
			errorStage: options.errorStage ?? null,
			now,
			lastViewedAt: options.viewed ? now : thread.last_viewed_at,
			lastVisibleUpdateAt: now,
			startedAt: options.startedAt,
		});
		this._refreshState();
	}

	private _refreshState() {
		const registry = this.listSubAgents(AIThread);
		const threadIds = new Set(registry.map((entry) => entry.name));
		const threads: AIThreadSummary[] = [];

		for (const row of this._getActiveThreadMetaRows()) {
			if (threadIds.has(row.id)) {
				threads.push(mapThreadMetaRow(row));
			}
		}

		threads.sort(compareThreadRecentFirst);

		this.setState({ ...this.state, isLoaded: true, threads });

		return {
			registeredThreadCount: registry.length,
			visibleThreadCount: threads.length,
		};
	}

	private async _importLinkedThread(input: {
		snapshot: LinkedAIThreadSnapshot;
		sourceUserId: string;
	}) {
		const { snapshot } = input;
		const existingImport = getLinkedThreadImport(this, {
			sourceThreadId: snapshot.meta.id,
			sourceUserId: input.sourceUserId,
		});

		if (
			existingImport &&
			this.hasSubAgent(AIThread, existingImport.target_thread_id) &&
			this._getThreadMeta(existingImport.target_thread_id)
		) {
			return;
		}

		if (existingImport) {
			deleteLinkedThreadImport(this, {
				sourceThreadId: snapshot.meta.id,
				sourceUserId: input.sourceUserId,
			});
		}

		const threadId = this._getAvailableImportedThreadId(snapshot.meta.id);
		const attachmentTransfer = {
			sourceThreadId: snapshot.meta.id,
			sourceUserId: input.sourceUserId,
			targetThreadId: threadId,
			targetUserId: this.name,
			workspaceId: snapshot.meta.workspace_id,
		};
		await this.subAgent(AIThread, threadId);
		const now = Date.now();

		try {
			await copyChatAttachmentsForThread(this.env.WORKSPACE_KERNEL_FILES, attachmentTransfer);
			insertThreadMetaRow(this, {
				...snapshot.meta,
				archived_at: null,
				id: threadId,
				updated_at: now,
			});

			if (snapshot.messages.length > 0) {
				const thread = await this.subAgent(AIThread, threadId);
				await thread.addMessages(
					rebindChatAttachmentMessageUrls(snapshot.messages, attachmentTransfer),
					{
						broadcast: false,
						mode: "upsert",
					},
				);
			}

			insertLinkedThreadImport(this, {
				now,
				sourceThreadId: snapshot.meta.id,
				sourceUserId: input.sourceUserId,
				targetThreadId: threadId,
			});
		} catch (error) {
			await this.deleteSubAgent(AIThread, threadId);
			deleteThreadMeta(this, threadId);
			await deleteChatAttachmentsForThread(this.env.WORKSPACE_KERNEL_FILES, {
				threadId,
				userId: this.name,
				workspaceId: snapshot.meta.workspace_id,
			});
			throw error;
		}

		await deleteChatAttachmentsForThread(this.env.WORKSPACE_KERNEL_FILES, {
			threadId: snapshot.meta.id,
			userId: input.sourceUserId,
			workspaceId: snapshot.meta.workspace_id,
		}).catch((error) => {
			console.error("Failed to delete source chat attachments after account linking", error);
		});

		this._refreshState();
	}

	private _getAvailableImportedThreadId(preferredId: string) {
		if (!this.hasSubAgent(AIThread, preferredId) && !this._getThreadMeta(preferredId)) {
			return preferredId;
		}

		let id = nanoid(12);
		while (this.hasSubAgent(AIThread, id) || this._getThreadMeta(id)) {
			id = nanoid(12);
		}

		return id;
	}

	private _normalizeLinkedThreadMeta(meta: AIThreadMetaRow): AIThreadMetaRow {
		if (meta.status !== "running") {
			return meta;
		}

		const now = Date.now();

		return {
			...meta,
			last_error_classification: null,
			last_error_message: "This chat was interrupted during account linking.",
			last_error_stage: null,
			last_run_finished_at: now,
			last_run_result: "aborted",
			last_run_started_at: null,
			last_visible_update_at: now,
			status: "idle",
			updated_at: now,
		};
	}

	private _getThreadMeta(threadId: string) {
		return this._getActiveThreadMetaRows().find((row) => row.id === threadId) ?? null;
	}

	private _getActiveThreadMetaRows() {
		return getActiveThreadMetaRows(this);
	}

	private _getThreadSummary(threadId: string) {
		const thread = this._getThreadMeta(threadId);

		return thread ? mapThreadMetaRow(thread) : null;
	}

	private async _requireThreadMeta(threadId: string): Promise<AIThreadMetaRow> {
		if (!this.hasSubAgent(AIThread, threadId)) {
			throw new AIThreadNotFoundError();
		}

		const thread = this._getThreadMeta(threadId);

		if (!thread || thread.archived_at !== null) {
			throw new AIThreadNotFoundError();
		}

		try {
			await getWorkspacePromptScope({
				userId: this.name,
				workspaceId: thread.workspace_id,
			});
		} catch {
			throw new AIThreadForbiddenError();
		}

		return thread;
	}

	private async _requireThreadMetaOrEnsureDefault(threadId: string): Promise<AIThreadMetaRow> {
		try {
			return await this._requireThreadMeta(threadId);
		} catch (error) {
			if (error instanceof AIThreadForbiddenError) {
				throw error;
			}

			const defaultThread = await this._ensureDefaultWorkspaceThread(threadId);
			if (!defaultThread) {
				throw error;
			}

			return this._requireThreadMeta(threadId);
		}
	}
}
