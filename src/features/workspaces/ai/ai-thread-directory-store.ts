import type { ChatErrorClassification, ChatErrorContext } from "@cloudflare/think";

import { ensureChatMetaColumns } from "#/features/workspaces/ai/ai-thread-directory-schema";
import type {
	AIThreadMetaRow,
	AIThreadRunResult,
} from "#/features/workspaces/ai/ai-thread-metadata";

type SqlQuery = <T = unknown>(
	strings: TemplateStringsArray,
	...values: (string | number | boolean | null)[]
) => T[];

interface ChatMetaStore {
	sql: SqlQuery;
}

interface InsertThreadMetaInput {
	id: string;
	workspaceId: string;
	title: string;
	now: number;
}

interface LinkedThreadImportInput {
	now: number;
	sourceThreadId: string;
	sourceUserId: string;
	targetThreadId: string;
}

interface FinishThreadRunInput {
	threadId: string;
	result: AIThreadRunResult;
	now: number;
	startedAt: number;
	lastAssistantMessageAt: number | null;
	lastVisibleUpdateAt: number | null;
	lastViewedAt: number;
	errorMessage: string | null;
	errorClassification: ChatErrorClassification | null;
	errorStage: ChatErrorContext["stage"] | null;
}

export function ensureChatMetaStore(store: ChatMetaStore) {
	store.sql`CREATE TABLE IF NOT EXISTS chat_meta (
		id TEXT PRIMARY KEY,
		workspace_id TEXT NOT NULL,
		title TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'idle',
		last_run_result TEXT,
		last_activity_at INTEGER NOT NULL,
		last_user_message_at INTEGER,
		last_assistant_message_at INTEGER,
		last_visible_update_at INTEGER,
		last_viewed_at INTEGER NOT NULL,
		last_run_started_at INTEGER,
		last_run_finished_at INTEGER,
		last_error_message TEXT,
		last_error_classification TEXT,
		last_error_stage TEXT,
		title_generated_at INTEGER,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		archived_at INTEGER
	)`;
	ensureChatMetaColumns(store);
	store.sql`CREATE INDEX IF NOT EXISTS chat_meta_workspace_activity_idx
		ON chat_meta (workspace_id, archived_at, last_activity_at)`;
	store.sql`CREATE TABLE IF NOT EXISTS linked_thread_imports (
		source_user_id TEXT NOT NULL,
		source_thread_id TEXT NOT NULL,
		target_thread_id TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (source_user_id, source_thread_id)
	)`;
}

export function insertThreadMeta(store: ChatMetaStore, input: InsertThreadMetaInput) {
	insertThreadMetaRow(store, {
		archived_at: null,
		created_at: input.now,
		id: input.id,
		last_activity_at: input.now,
		last_assistant_message_at: null,
		last_error_classification: null,
		last_error_message: null,
		last_error_stage: null,
		last_run_finished_at: null,
		last_run_result: null,
		last_run_started_at: null,
		last_user_message_at: null,
		last_viewed_at: input.now,
		last_visible_update_at: null,
		status: "idle",
		title: input.title,
		title_generated_at: null,
		updated_at: input.now,
		workspace_id: input.workspaceId,
	});
}

export function insertThreadMetaRow(store: ChatMetaStore, input: AIThreadMetaRow) {
	store.sql`
		INSERT INTO chat_meta (
			id,
			workspace_id,
			title,
			status,
			last_run_result,
			last_activity_at,
			last_user_message_at,
			last_assistant_message_at,
			last_visible_update_at,
			last_viewed_at,
			last_run_started_at,
			last_run_finished_at,
			last_error_message,
			last_error_classification,
			last_error_stage,
			title_generated_at,
			created_at,
			updated_at,
			archived_at
		)
		VALUES (
			${input.id},
			${input.workspace_id},
			${input.title},
			${input.status},
			${input.last_run_result},
			${input.last_activity_at},
			${input.last_user_message_at},
			${input.last_assistant_message_at},
			${input.last_visible_update_at},
			${input.last_viewed_at},
			${input.last_run_started_at},
			${input.last_run_finished_at},
			${input.last_error_message},
			${input.last_error_classification},
			${input.last_error_stage},
			${input.title_generated_at},
			${input.created_at},
			${input.updated_at},
			${input.archived_at}
		)
	`;
}

export function getLinkedThreadImport(
	store: ChatMetaStore,
	input: { sourceThreadId: string; sourceUserId: string },
) {
	const [row] = store.sql<{ target_thread_id: string }>`
		SELECT target_thread_id
		FROM linked_thread_imports
		WHERE source_user_id = ${input.sourceUserId}
			AND source_thread_id = ${input.sourceThreadId}
	`;

	return row ?? null;
}

export function insertLinkedThreadImport(store: ChatMetaStore, input: LinkedThreadImportInput) {
	store.sql`
		INSERT INTO linked_thread_imports (
			source_user_id,
			source_thread_id,
			target_thread_id,
			created_at
		)
		VALUES (
			${input.sourceUserId},
			${input.sourceThreadId},
			${input.targetThreadId},
			${input.now}
		)
	`;
}

export function deleteLinkedThreadImport(
	store: ChatMetaStore,
	input: { sourceThreadId: string; sourceUserId: string },
) {
	store.sql`
		DELETE FROM linked_thread_imports
		WHERE source_user_id = ${input.sourceUserId}
			AND source_thread_id = ${input.sourceThreadId}
	`;
}

export function markThreadMetaViewed(store: ChatMetaStore, threadId: string, now: number) {
	store.sql`
		UPDATE chat_meta
		SET last_viewed_at = ${now}, updated_at = ${now}
		WHERE id = ${threadId} AND archived_at IS NULL
	`;
}

export function deleteThreadMeta(store: ChatMetaStore, threadId: string) {
	store.sql`DELETE FROM chat_meta WHERE id = ${threadId}`;
}

export function markThreadRunStarted(
	store: ChatMetaStore,
	input: {
		threadId: string;
		now: number;
		isUserMessage: boolean;
	},
) {
	store.sql`
		UPDATE chat_meta
		SET
			status = 'running',
			last_run_result = NULL,
			last_activity_at = ${input.now},
			last_user_message_at = CASE
				WHEN ${input.isUserMessage} THEN ${input.now}
				ELSE last_user_message_at
			END,
			last_run_started_at = ${input.now},
			last_run_finished_at = NULL,
			last_error_message = NULL,
			last_error_classification = NULL,
			last_error_stage = NULL,
			updated_at = ${input.now}
		WHERE id = ${input.threadId} AND archived_at IS NULL
	`;
}

export function markThreadRunFinished(store: ChatMetaStore, input: FinishThreadRunInput) {
	store.sql`
		UPDATE chat_meta
		SET
			status = 'idle',
			last_run_result = ${input.result},
			last_activity_at = ${input.now},
			last_assistant_message_at = ${input.lastAssistantMessageAt},
			last_visible_update_at = ${input.lastVisibleUpdateAt},
			last_viewed_at = ${input.lastViewedAt},
			last_run_started_at = NULL,
			last_run_finished_at = ${input.now},
			last_error_message = ${input.errorMessage},
			last_error_classification = ${input.errorClassification},
			last_error_stage = ${input.errorStage},
			updated_at = ${input.now}
		WHERE id = ${input.threadId}
			AND archived_at IS NULL
			AND last_run_started_at = ${input.startedAt}
	`;
}

export function markGeneratedThreadTitle(
	store: ChatMetaStore,
	threadId: string,
	title: string,
	now: number,
) {
	store.sql`
		UPDATE chat_meta
		SET title = ${title}, title_generated_at = ${now}, updated_at = ${now}
		WHERE id = ${threadId}
			AND archived_at IS NULL
			AND title_generated_at IS NULL
	`;
}

export function markThreadRunFailed(
	store: ChatMetaStore,
	input: {
		threadId: string;
		errorMessage: string;
		errorClassification: ChatErrorClassification | null;
		errorStage: ChatErrorContext["stage"] | null;
		now: number;
		lastViewedAt: number;
		lastVisibleUpdateAt: number;
		startedAt?: number;
	},
) {
	if (input.startedAt === undefined) {
		store.sql`
			UPDATE chat_meta
			SET
				status = 'idle',
				last_run_result = 'error',
				last_activity_at = ${input.now},
				last_visible_update_at = ${input.lastVisibleUpdateAt},
				last_viewed_at = ${input.lastViewedAt},
				last_run_started_at = NULL,
				last_run_finished_at = ${input.now},
				last_error_message = ${input.errorMessage},
				last_error_classification = ${input.errorClassification},
				last_error_stage = ${input.errorStage},
				updated_at = ${input.now}
			WHERE id = ${input.threadId} AND archived_at IS NULL
		`;
		return;
	}

	store.sql`
		UPDATE chat_meta
		SET
			status = 'idle',
			last_run_result = 'error',
			last_activity_at = ${input.now},
			last_visible_update_at = ${input.lastVisibleUpdateAt},
			last_viewed_at = ${input.lastViewedAt},
			last_run_started_at = NULL,
			last_run_finished_at = ${input.now},
			last_error_message = ${input.errorMessage},
			last_error_classification = ${input.errorClassification},
			last_error_stage = ${input.errorStage},
			updated_at = ${input.now}
		WHERE id = ${input.threadId}
			AND archived_at IS NULL
			AND last_run_started_at = ${input.startedAt}
	`;
}

export function getActiveThreadMetaRows(store: ChatMetaStore) {
	return store.sql<AIThreadMetaRow>`
		SELECT
			id,
			workspace_id,
			title,
			status,
			last_run_result,
			last_activity_at,
			last_user_message_at,
			last_assistant_message_at,
			last_visible_update_at,
			last_viewed_at,
			last_run_started_at,
			last_run_finished_at,
			last_error_message,
			last_error_classification,
			last_error_stage,
			title_generated_at,
			created_at,
			updated_at,
			archived_at
		FROM chat_meta
		WHERE archived_at IS NULL
	`;
}
