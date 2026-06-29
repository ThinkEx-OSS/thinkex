type SqlQuery = <T = unknown>(
	strings: TemplateStringsArray,
	...values: (string | number | boolean | null)[]
) => T[];

interface ChatMetaSqlStore {
	sql: SqlQuery;
}

export function ensureChatMetaColumns(store: ChatMetaSqlStore) {
	const existingColumns = new Set(
		store.sql<{ name: string }>`PRAGMA table_info(chat_meta)`.map((column) => column.name),
	);

	if (!existingColumns.has("title_generated_at")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN title_generated_at INTEGER`;
	}

	if (!existingColumns.has("last_run_result")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_run_result TEXT`;
	}

	if (!existingColumns.has("last_run_started_at")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_run_started_at INTEGER`;
	}

	if (!existingColumns.has("last_run_finished_at")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_run_finished_at INTEGER`;
	}

	if (!existingColumns.has("last_error_message")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_error_message TEXT`;
	}

	if (!existingColumns.has("last_visible_update_at")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_visible_update_at INTEGER`;
	}

	if (!existingColumns.has("last_error_classification")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_error_classification TEXT`;
	}

	if (!existingColumns.has("last_error_stage")) {
		store.sql`ALTER TABLE chat_meta ADD COLUMN last_error_stage TEXT`;
	}
}
