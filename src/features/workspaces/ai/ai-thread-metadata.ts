import type { ChatErrorClassification, ChatErrorContext } from "@cloudflare/think";

export type AIThreadRunState = "idle" | "running";
export type AIThreadRunResult = "completed" | "skipped" | "aborted" | "error";

export interface AIThreadSummary {
	id: string;
	workspaceId: string;
	title: string;
	hasUnreadUpdate: boolean;
	isRunning: boolean;
	lastRunResult: AIThreadRunResult | null;
	lastErrorMessage: string | null;
	lastErrorClassification: ChatErrorClassification | null;
	lastErrorStage: ChatErrorContext["stage"] | null;
	lastActivityAt: string;
	lastUserMessageAt: string | null;
	lastAssistantMessageAt: string | null;
	lastVisibleUpdateAt: string | null;
	lastViewedAt: string;
	lastRunStartedAt: string | null;
	lastRunFinishedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface UserAIStoreState {
	isLoaded: boolean;
	threads: AIThreadSummary[];
}

export interface AIThreadContext {
	id: string;
	workspaceId: string;
	promptScope: AIThreadPromptScope;
	userId: string;
}

export interface AIThreadPromptScope {
	canMutate: boolean;
	workspaceName: string;
}

export interface AIThreadMetaRow {
	id: string;
	workspace_id: string;
	title: string;
	status: AIThreadRunState;
	last_run_result: AIThreadRunResult | null;
	last_activity_at: number;
	last_user_message_at: number | null;
	last_assistant_message_at: number | null;
	last_visible_update_at: number | null;
	last_viewed_at: number;
	last_run_started_at: number | null;
	last_run_finished_at: number | null;
	last_error_message: string | null;
	last_error_classification: ChatErrorClassification | null;
	last_error_stage: ChatErrorContext["stage"] | null;
	title_generated_at: number | null;
	created_at: number;
	updated_at: number;
	archived_at: number | null;
}

export function getThreadTitle() {
	return "New chat";
}

export function normalizeGeneratedThreadTitle(value: string | undefined) {
	const title = value
		?.replace(/^["'`]+|["'`.]+$/g, "")
		.replace(/\s+/g, " ")
		.trim();

	if (!title) {
		return null;
	}

	return title.length > 64 ? `${title.slice(0, 61).trimEnd()}...` : title;
}

export function normalizeThreadErrorMessage(error: unknown) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "Chat response failed";
	const normalized = message.replace(/\s+/g, " ").trim();

	if (!normalized) {
		return "Chat response failed";
	}

	return normalized.length > 240 ? `${normalized.slice(0, 237).trimEnd()}...` : normalized;
}

export function mapThreadMetaRow(row: AIThreadMetaRow): AIThreadSummary {
	const lastVisibleUpdateAt = row.last_visible_update_at ?? row.last_assistant_message_at;

	return {
		id: row.id,
		workspaceId: row.workspace_id,
		title: row.title,
		hasUnreadUpdate: Boolean(lastVisibleUpdateAt && lastVisibleUpdateAt > row.last_viewed_at),
		isRunning: row.status === "running",
		lastRunResult: row.last_run_result,
		lastErrorMessage: row.last_error_message,
		lastErrorClassification: row.last_error_classification,
		lastErrorStage: row.last_error_stage,
		lastActivityAt: toIsoString(row.last_activity_at),
		lastUserMessageAt: toNullableIsoString(row.last_user_message_at),
		lastAssistantMessageAt: toNullableIsoString(row.last_assistant_message_at),
		lastVisibleUpdateAt: toNullableIsoString(row.last_visible_update_at),
		lastViewedAt: toIsoString(row.last_viewed_at),
		lastRunStartedAt: toNullableIsoString(row.last_run_started_at),
		lastRunFinishedAt: toNullableIsoString(row.last_run_finished_at),
		createdAt: toIsoString(row.created_at),
		updatedAt: toIsoString(row.updated_at),
	};
}

export function compareThreadRecentFirst(left: AIThreadSummary, right: AIThreadSummary) {
	return (
		right.lastActivityAt.localeCompare(left.lastActivityAt) ||
		right.createdAt.localeCompare(left.createdAt)
	);
}

function toNullableIsoString(value: number | null) {
	return value === null ? null : toIsoString(value);
}

function toIsoString(value: number) {
	return new Date(value).toISOString();
}
