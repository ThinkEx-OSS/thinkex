import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

export function initializeWorkspaceSearchStorage(sql: WorkspaceKernelSql) {
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_items (
			item_id TEXT PRIMARY KEY,
			source_version TEXT NOT NULL,
			vector_ready INTEGER NOT NULL DEFAULT 0
		)
	`;
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_chunks (
			chunk_id TEXT PRIMARY KEY,
			item_id TEXT NOT NULL,
			page_number INTEGER,
			start_line INTEGER,
			end_line INTEGER
		)
	`;
	sql`CREATE INDEX IF NOT EXISTS kernel_search_chunks_item_idx
		ON kernel_search_chunks (item_id)`;
	sql`
		CREATE VIRTUAL TABLE IF NOT EXISTS kernel_search_fts USING fts5(
			chunk_id UNINDEXED,
			title,
			path,
			content,
			tokenize = 'unicode61 remove_diacritics 2'
		)
	`;
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_pending (
			item_id TEXT PRIMARY KEY,
			requested_at INTEGER NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0
		)
	`;
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_vector_deletes (
			vector_id TEXT PRIMARY KEY,
			requested_at INTEGER NOT NULL
		)
	`;
}
