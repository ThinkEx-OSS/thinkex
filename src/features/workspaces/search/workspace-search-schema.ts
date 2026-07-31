import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

const workspaceSearchStorageVersion = 1;

export function initializeWorkspaceSearchStorage(sql: WorkspaceKernelSql) {
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_metadata (
			key TEXT PRIMARY KEY,
			value INTEGER NOT NULL
		)
	`;
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_vector_deletes (
			vector_id TEXT PRIMARY KEY,
			requested_at INTEGER NOT NULL
		)
	`;

	const storedVersion = sql<{ value: number }>`
		SELECT value
		FROM kernel_search_metadata
		WHERE key = 'storage_version'
		LIMIT 1
	`[0]?.value;
	if (storedVersion !== workspaceSearchStorageVersion) {
		// Search is derived, so schema changes reset only this projection and
		// queue its old vectors for deletion without touching workspace data.
		const hasChunks = sql<{ name: string }>`
			SELECT name
			FROM sqlite_master
			WHERE type = 'table' AND name = 'kernel_search_chunks'
			LIMIT 1
		`[0];
		if (hasChunks) {
			sql`
				INSERT OR IGNORE INTO kernel_search_vector_deletes (vector_id, requested_at)
				SELECT chunk_id, ${Date.now()} FROM kernel_search_chunks
			`;
		}
		sql`DROP TABLE IF EXISTS kernel_search_fts`;
		sql`DROP TABLE IF EXISTS kernel_search_chunks`;
		sql`DROP TABLE IF EXISTS kernel_search_items`;
		sql`DROP TABLE IF EXISTS kernel_search_pending`;
	}

	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_items (
			item_id TEXT PRIMARY KEY,
			source_version TEXT NOT NULL,
			vector_status TEXT NOT NULL DEFAULT 'pending'
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
		INSERT INTO kernel_search_metadata (key, value)
		VALUES ('storage_version', ${workspaceSearchStorageVersion})
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`;
}
