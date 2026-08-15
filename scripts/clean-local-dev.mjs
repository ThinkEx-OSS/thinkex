import { execFileSync } from "node:child_process";
import { rmSync, statSync } from "node:fs";
import { Client } from "pg";

import { getLocalPostgresConfig } from "./local-postgres-config.mjs";

// Reclaims local development artifacts that nothing prunes on its own.
//
// Deliberately NOT touched, because they hold local application data that exists
// nowhere else: .wrangler/state/v3/do (Durable Object SQLite — workspaces,
// documents, AI threads) and .wrangler/state/v3/r2 (uploaded files). Losing
// those is indistinguishable from losing your local work, so this script never
// removes them and there is no flag that makes it.
const args = new Set(process.argv.slice(2));
const apply = args.has("--yes");
const includeDatabases = args.has("--databases");
const includeDockerCache = args.has("--docker-cache");

const TRACE_STORE = ".wrangler/state/v3/observability";
const TASK_CACHE = "node_modules/.vite/task-cache";
const plans = [];
let admin;

function megabytes(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function directorySize(path) {
	try {
		statSync(path);
	} catch {
		return 0;
	}

	return Number.parseInt(execFileSync("du", ["-sk", path], { encoding: "utf8" }), 10) * 1024;
}

function docker(dockerArgs) {
	return execFileSync("docker", dockerArgs, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

// Miniflare's local trace store. Pure telemetry — nothing in the app reads it,
// and `pnpm dev` no longer writes it, so this only reclaims the backlog.
const traceBytes = directorySize(TRACE_STORE);

if (traceBytes > 0) {
	plans.push({
		label: `Miniflare trace store (${TRACE_STORE})`,
		bytes: traceBytes,
		run: () => rmSync(TRACE_STORE, { recursive: true, force: true }),
	});
}

// The Vite Task cache, which speeds up `pnpm verify` but never evicts entries by
// age or size — per Vite+'s own docs it only grows. Behind a flag because
// clearing it means the next `pnpm verify` re-runs everything from cold.
if (args.has("--task-cache")) {
	const taskCacheBytes = directorySize(TASK_CACHE);

	if (taskCacheBytes > 0) {
		plans.push({
			label: `Vite Task cache (${TASK_CACHE}) — next verify runs cold`,
			bytes: taskCacheBytes,
			run: () => rmSync(TASK_CACHE, { recursive: true, force: true }),
		});
	}
}

// Locally built container images, rebuilt on demand by `pnpm dev:full`.
try {
	const images = docker(["images", "--format", "{{.Repository}}:{{.Tag}}\t{{.ID}}"])
		.split("\n")
		.filter((line) => line.startsWith("cloudflare-dev/"))
		.map((line) => {
			const [reference, id] = line.split("\t");
			return { reference, id };
		});

	if (images.length > 0) {
		const ids = [...new Set(images.map((image) => image.id))];
		plans.push({
			label: `${images.length} cloudflare-dev container image(s)`,
			detail: images.map((image) => image.reference),
			run: () => docker(["image", "rm", "-f", ...ids]),
		});
	}
} catch {
	console.log("Docker is not reachable — skipping image cleanup.");
}

// Docker's build cache is machine-wide rather than scoped to this project, so
// other projects lose their cached layers too. Hence its own flag.
if (includeDockerCache) {
	plans.push({
		label: "Docker build cache (machine-wide, affects other projects)",
		run: () => docker(["builder", "prune", "-f"]),
	});
}

// Postgres databases left behind by ports and workspace IDs used at some point
// in the past. Guarded twice: never the database this checkout resolves to, and
// never one with an open connection — which is how a running worktree, or a psql
// session you forgot about, announces itself.
if (includeDatabases) {
	const current = getLocalPostgresConfig();
	admin = new Client({ database: "postgres" });
	await admin.connect();

	const { rows } = await admin.query(`
		select d.datname,
		       pg_database_size(d.datname) as bytes,
		       (select count(*) from pg_stat_activity a where a.datname = d.datname) as connections
		from pg_database d
		where d.datname like 'thinkex\\_%'
		order by d.datname
	`);

	for (const row of rows) {
		if (row.datname === current.databaseName) {
			console.log(`keep  ${row.datname} — this checkout's database`);
			continue;
		}

		if (Number(row.connections) > 0) {
			console.log(`keep  ${row.datname} — ${row.connections} open connection(s), in use`);
			continue;
		}

		const roleName = row.datname.replace(/^thinkex_/, "thinkex_local_");
		plans.push({
			label: `database ${row.datname} (+ role ${roleName})`,
			bytes: Number(row.bytes),
			run: async () => {
				await admin.query(`drop database ${row.datname}`);

				try {
					await admin.query(`drop role ${roleName}`);
				} catch (error) {
					console.log(`  kept role ${roleName}: ${error.message}`);
				}
			},
		});
	}
}

try {
	if (plans.length === 0) {
		console.log("Nothing to reclaim.");
	} else {
		const total = plans.reduce((sum, plan) => sum + (plan.bytes ?? 0), 0);

		console.log(`\n${apply ? "Removing" : "Would remove"}:`);

		for (const plan of plans) {
			console.log(`  ${plan.label}${plan.bytes ? ` — ${megabytes(plan.bytes)}` : ""}`);

			for (const line of plan.detail ?? []) {
				console.log(`      ${line}`);
			}
		}

		if (total > 0) {
			console.log(`\n  measured total: ${megabytes(total)}`);
			console.log("  (container images excluded — shared layers make per-image sizes overlap)");
		}

		if (apply) {
			console.log("");

			for (const plan of plans) {
				// Some plans are synchronous filesystem/docker calls, others are queries.
				await Promise.resolve(plan.run());
				console.log(`removed ${plan.label}`);
			}
		} else {
			console.log("\nDry run. Re-run with --yes to apply.");
			console.log("  --databases     also drop idle thinkex_* databases and their roles");
			console.log("  --task-cache    also clear the Vite Task cache (next verify runs cold)");
			console.log("  --docker-cache  also prune Docker's build cache (affects other projects)");
		}
	}
} finally {
	await admin?.end();
}
