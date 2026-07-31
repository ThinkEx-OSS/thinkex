import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";
import { workspaceSearchIndexVersion } from "#/features/workspaces/search/workspace-search-version";

const workspaceSearchVersionKey = "workspace_search_version";

export function initializeWorkspaceSearchStorage(sql: WorkspaceKernelSql) {
	sql`
		CREATE TABLE IF NOT EXISTS kernel_search_vector_deletes (
			vector_id TEXT PRIMARY KEY,
			requested_at INTEGER NOT NULL,
			attempts INTEGER NOT NULL DEFAULT 0
		)
	`;
	// The delete queue survives version resets (its rows reference vectors still
	// live in Vectorize), so it is never rebuilt by the reset below. Objects whose
	// table predates the `attempts` column must gain it here, or every flush throws
	// "no such column: attempts" and indexing stalls forever.
	const hasAttemptsColumn = sql<{ name: string }>`
		PRAGMA table_info(kernel_search_vector_deletes)
	`.some((column) => column.name === "attempts");
	if (!hasAttemptsColumn) {
		sql`ALTER TABLE kernel_search_vector_deletes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`;
	}
	sql`CREATE INDEX IF NOT EXISTS kernel_search_vector_deletes_pending_idx
		ON kernel_search_vector_deletes (requested_at)`;

	const storedVersion = sql<{ value: string }>`
		SELECT value
		FROM kernel_meta
		WHERE key = ${workspaceSearchVersionKey}
		LIMIT 1
	`[0]?.value;
	if (storedVersion !== workspaceSearchIndexVersion) {
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
	sql`CREATE INDEX IF NOT EXISTS kernel_search_pending_requested_idx
		ON kernel_search_pending (requested_at)`;

	sql`
		INSERT INTO kernel_meta (key, value, updated_at)
		VALUES (${workspaceSearchVersionKey}, ${workspaceSearchIndexVersion}, ${Date.now()})
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = excluded.updated_at
	`;
}
