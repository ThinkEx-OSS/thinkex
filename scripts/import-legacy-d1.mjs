import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import pg from "pg";

const tableSpecs = [
	{
		name: "user",
		booleans: ["email_verified", "is_anonymous"],
		dates: ["created_at", "updated_at"],
	},
	{
		name: "session",
		dates: ["expires_at", "created_at", "updated_at"],
	},
	{
		name: "account",
		dates: ["access_token_expires_at", "refresh_token_expires_at", "created_at", "updated_at"],
	},
	{
		name: "verification",
		dates: ["expires_at", "created_at", "updated_at"],
	},
	{ name: "rate_limit" },
	{ name: "jwks", dates: ["created_at", "expires_at"] },
	{
		name: "oauth_client",
		booleans: ["disabled", "skip_consent", "enable_end_session", "public", "require_pkce"],
		dates: ["created_at", "updated_at"],
		json: [
			"scopes",
			"contacts",
			"redirect_uris",
			"post_logout_redirect_uris",
			"grant_types",
			"response_types",
			"metadata",
		],
	},
	{
		name: "oauth_refresh_token",
		dates: ["expires_at", "created_at", "revoked", "auth_time"],
		json: ["scopes"],
	},
	{
		name: "oauth_access_token",
		dates: ["expires_at", "created_at"],
		json: ["scopes"],
	},
	{
		name: "oauth_consent",
		dates: ["created_at", "updated_at"],
		json: ["scopes"],
	},
	{ name: "workspaces", dates: ["created_at", "updated_at", "archived_at"] },
	{
		name: "workspace_members",
		dates: ["last_opened_at", "created_at", "updated_at"],
	},
	{
		name: "workspace_invites",
		dates: ["expires_at", "created_at", "updated_at"],
	},
];

const options = parseArguments(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL?.trim();
const migrationToken = process.env.POSTGRES_MIGRATION_TOKEN?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
if (!migrationToken) throw new Error("POSTGRES_MIGRATION_TOKEN is required.");

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(readFileSync(options.d1Export, "utf8"));
const source = new Map(tableSpecs.map((spec) => [spec.name, readSourceRows(sqlite, spec)]));
const workspaceIds = (source.get("workspaces") ?? []).map((row) => String(row.id));
const client = new pg.Client({ connectionString: databaseUrl });

await client.connect();
try {
	await importD1Rows(client, source);
	for (const workspaceId of workspaceIds) {
		const response = await fetch(
			`${options.appUrl}/api/internal/migrations/postgres/workspaces/${encodeURIComponent(workspaceId)}`,
			{
				method: "POST",
				headers: { authorization: `Bearer ${migrationToken}` },
			},
		);
		if (!response.ok) {
			throw new Error(
				`Workspace ${workspaceId} migration failed (${response.status}): ${await response.text()}`,
			);
		}
		console.log(JSON.stringify(await response.json()));
	}
	await verifyImport(client, source, workspaceIds);
} finally {
	await client.end();
	sqlite.close();
}

function parseArguments(arguments_) {
	arguments_ = arguments_.filter((argument) => argument !== "--");
	if (arguments_.length % 2 !== 0) throw new Error("Migration arguments must be name/value pairs.");
	const values = new Map();
	for (let index = 0; index < arguments_.length; index += 2) {
		values.set(arguments_[index], arguments_[index + 1]);
	}
	const d1Export = values.get("--d1-export");
	const appUrl = values.get("--app-url")?.replace(/\/$/, "");
	if (!d1Export || !appUrl) {
		throw new Error("Usage: node scripts/import-legacy-d1.mjs --d1-export <path> --app-url <url>");
	}
	return { appUrl, d1Export };
}

function readSourceRows(sqlite, spec) {
	const exists = sqlite
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
		.get(spec.name);
	if (!exists) return [];
	return sqlite
		.prepare(`SELECT * FROM ${quoteIdentifier(spec.name)}`)
		.all()
		.map((row) => {
			const transformed = { ...row };
			for (const column of spec.booleans ?? []) {
				if (transformed[column] !== null) transformed[column] = Boolean(transformed[column]);
			}
			for (const column of spec.dates ?? []) {
				if (transformed[column] !== null)
					transformed[column] = sqliteTimestamp(transformed[column]);
			}
			for (const column of spec.json ?? []) {
				if (transformed[column] !== null && typeof transformed[column] === "string") {
					transformed[column] = JSON.parse(transformed[column]);
				}
			}
			return transformed;
		});
}

async function importD1Rows(client, source) {
	await client.query(`
		CREATE TABLE IF NOT EXISTS legacy_data_migrations (
			scope text PRIMARY KEY,
			completed_at timestamptz NOT NULL
		)
	`);
	if ((await client.query("SELECT 1 FROM legacy_data_migrations WHERE scope = 'd1'")).rowCount) {
		console.log("Legacy D1 rows already imported; continuing with workspace data.");
		return;
	}

	for (const spec of tableSpecs) {
		const count = await client.query(
			`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(spec.name)}`,
		);
		if (count.rows[0].count > 0) {
			throw new Error(`Destination table ${spec.name} is not empty and has no migration marker.`);
		}
	}

	await client.query("BEGIN");
	try {
		for (const spec of tableSpecs) {
			for (const row of source.get(spec.name) ?? []) await insertRow(client, spec.name, row);
		}
		await client.query(
			"INSERT INTO legacy_data_migrations (scope, completed_at) VALUES ('d1', NOW())",
		);
		await client.query("COMMIT");
		console.log("Legacy D1 rows imported.");
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	}
}

async function insertRow(client, table, row) {
	const columns = Object.keys(row);
	const parameters = columns.map((_, index) => `$${index + 1}`).join(", ");
	await client.query(
		`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${parameters})`,
		columns.map((column) => row[column]),
	);
}

async function verifyImport(client, source, workspaceIds) {
	for (const spec of tableSpecs) {
		const result = await client.query(
			`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(spec.name)}`,
		);
		const expected = (source.get(spec.name) ?? []).length;
		if (result.rows[0].count !== expected) {
			throw new Error(
				`${spec.name} verification failed: expected ${expected}, got ${result.rows[0].count}.`,
			);
		}
	}
	const markers = await client.query(
		"SELECT COUNT(*)::int AS count FROM legacy_data_migrations WHERE scope LIKE 'workspace:%'",
	);
	if (markers.rows[0].count !== workspaceIds.length) {
		throw new Error(
			`Workspace verification failed: expected ${workspaceIds.length} markers, got ${markers.rows[0].count}.`,
		);
	}
	await client.query(`
		INSERT INTO legacy_data_migrations (scope, completed_at)
		VALUES ('cutover', NOW())
		ON CONFLICT (scope) DO UPDATE SET completed_at = excluded.completed_at
	`);
	console.log(`Verified ${tableSpecs.length} D1 tables and ${workspaceIds.length} workspaces.`);
}

function sqliteTimestamp(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) throw new Error(`Invalid SQLite timestamp: ${value}`);
	return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
}

function quoteIdentifier(value) {
	return `"${String(value).replaceAll('"', '""')}"`;
}
