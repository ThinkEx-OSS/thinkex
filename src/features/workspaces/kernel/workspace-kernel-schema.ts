import { WORKSPACE_ITEM_SORT_STEP } from "#/features/workspaces/defaults";

export const workspaceRevisionKey = "workspace_revision";
export const workspaceItemSortStep = WORKSPACE_ITEM_SORT_STEP;

export type WorkspaceKernelSql = <T = Record<string, unknown>>(
	strings: TemplateStringsArray,
	...values: (string | number | boolean | null)[]
) => T[];

export function initializeWorkspaceKernelStorage(sql: WorkspaceKernelSql) {
	sql`
		CREATE TABLE IF NOT EXISTS kernel_items (
			id TEXT PRIMARY KEY,
			parent_id TEXT,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			color TEXT,
			metadata_json TEXT NOT NULL DEFAULT '{}',
			sort_order INTEGER NOT NULL,
			shell_path TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			deleted_at INTEGER
		)
	`;
	sql`CREATE INDEX IF NOT EXISTS kernel_items_parent_idx
		ON kernel_items (parent_id, deleted_at, sort_order)`;
	sql`CREATE INDEX IF NOT EXISTS kernel_items_type_idx
		ON kernel_items (type, deleted_at)`;
	createSiblingNameIndexes(sql);
	sql`
		CREATE TABLE IF NOT EXISTS kernel_item_projections (
			item_id TEXT NOT NULL,
			format TEXT NOT NULL,
			status TEXT NOT NULL,
			provider TEXT,
			provider_mode TEXT,
			content_shell_path TEXT,
			error_message TEXT,
			source_hash TEXT,
			metadata_json TEXT NOT NULL DEFAULT '{}',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			PRIMARY KEY (item_id, format)
		)
	`;
	sql`CREATE INDEX IF NOT EXISTS kernel_item_projections_status_idx
		ON kernel_item_projections (status, updated_at)`;
	sql`
		CREATE TABLE IF NOT EXISTS kernel_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`;
	sql`
		CREATE TABLE IF NOT EXISTS kernel_events (
			id TEXT PRIMARY KEY,
			revision INTEGER NOT NULL UNIQUE,
			type TEXT NOT NULL,
			actor_user_id TEXT,
			client_mutation_id TEXT,
			payload_json TEXT NOT NULL,
			created_at INTEGER NOT NULL
		)
	`;
	sql`CREATE INDEX IF NOT EXISTS kernel_events_revision_idx
		ON kernel_events (revision)`;
}

function createSiblingNameIndexes(sql: WorkspaceKernelSql) {
	try {
		sql`
			CREATE UNIQUE INDEX IF NOT EXISTS kernel_items_root_name_unique
			ON kernel_items (name)
			WHERE parent_id IS NULL AND deleted_at IS NULL
		`;
		sql`
			CREATE UNIQUE INDEX IF NOT EXISTS kernel_items_parent_name_unique
			ON kernel_items (parent_id, name)
			WHERE parent_id IS NOT NULL AND deleted_at IS NULL
		`;
	} catch (error) {
		console.warn("[WorkspaceKernel] Unable to create sibling name indexes", error);
	}
}
