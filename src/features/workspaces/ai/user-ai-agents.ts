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
	purgeForDeletion(): Promise<void>;
}

export const AIThread = createAIThreadClass(() => UserAIStore);

export function transferUserAIThreadsOnAccountLink(input: {
	anonymousUserId: string;
	env: Cloudflare.Env;
	newUserId: string;
}) {
	const store = getAgentByName(input.env[userAIAgentName], input.newUserId) as unknown as {
		mergeLinkedAnonymousUser(input: { anonymousUserId: string }): Promise<void>;
	};
	return store.mergeLinkedAnonymousUser({ anonymousUserId: input.anonymousUserId });
}

export class UserAIStore extends Agent<Cloudflare.Env, UserAIStoreState> {
	static options = { sendIdentityOnConnect: false };

	initialState: UserAIStoreState = { isLoaded: false, threads: [] };

	onStart() {
		ensureChatMetaStore(this);
		this._refreshState();
	}

	override async onBeforeSubAgent(
		_request: Request,
		{ className, name }: { className: string; name: string },
	): Promise<Request | Response | undefined> {
		if (className !== aiThreadAgentName) {
			return new Response("Chat thread not found", { status: 404 });
		}

		try {
			await this._requireThreadMeta(name);
		} catch (error) {
			if (error instanceof AIThreadForbiddenError) {
				return new Response("Forbidden", { status: 403 });
			}

			try {
				const defaultThread = await this._ensureDefaultWorkspaceThread(name);
				if (defaultThread) {
					return undefined;
				}
			} catch (ensureError) {
				if (ensureError instanceof AIThreadForbiddenError) {
					return new Response("Forbidden", { status: 403 });
				}
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
		await this._requireThreadMeta(threadId);
		await this.deleteSubAgent(AIThread, threadId);
		deleteThreadMeta(this, threadId);
		this._refreshState();
	}

	@callable()
	async purgeForDeletion(): Promise<void> {
		for (const thread of this._getActiveThreadMetaRows()) {
			try {
				if (this.hasSubAgent(AIThread, thread.id)) {
					await this.deleteSubAgent(AIThread, thread.id);
				}

				deleteThreadMeta(this, thread.id);
			} catch (error) {
				console.warn("[UserAIStore] Failed to purge chat thread during deletion", {
					threadId: thread.id,
					error,
				});
			}
		}

		this._refreshState();
		await this.ctx.storage.deleteAll();
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
			const thread = await this._requireThreadMeta(threadId);
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
		await this.subAgent(AIThread, threadId);
		const now = Date.now();

		try {
			insertThreadMetaRow(this, {
				...snapshot.meta,
				archived_at: null,
				id: threadId,
				updated_at: now,
			});

			if (snapshot.messages.length > 0) {
				const thread = await this.subAgent(AIThread, threadId);
				await thread.addMessages(snapshot.messages, {
					broadcast: false,
					mode: "upsert",
				});
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
			throw error;
		}

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
}
