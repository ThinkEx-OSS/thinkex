import { spawn, spawnSync } from "node:child_process";

import { getLocalPostgresConfig } from "./local-postgres-config.mjs";

const secretsMode = process.argv.includes("--infisical") ? "infisical" : "environment";
// "lite" (the default) runs the dev server with every Cloudflare binding emulated
// locally and no containers, so an ordinary session bills nothing and skips the
// Docker build. "full" restores the production-shaped path — remote AI, Browser
// Rendering, Email, and the real staging R2 bucket, plus the three containers —
// for the cases that actually need it. vite.config.ts reads THINKEX_DEV_PROFILE.
const devProfile =
	process.argv.includes("--full") || process.env.THINKEX_DEV_PROFILE?.trim() === "full"
		? "full"
		: "lite";
const localPostgres = getLocalPostgresConfig();
const configuredDatabaseUrl =
	process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE?.trim();
const localDatabaseUrl = configuredDatabaseUrl || localPostgres.url;
const shouldPrepareLocalDatabase = process.env.CONDUCTOR_IS_LOCAL !== "0" && !configuredDatabaseUrl;

if (shouldPrepareLocalDatabase) {
	run("node", ["scripts/ensure-local-postgres.mjs"], {
		...process.env,
	});
	run("pnpm", ["db:migrate:local"], {
		...process.env,
		CI: "true",
		DATABASE_URL: localDatabaseUrl,
	});
}

// Say plainly what this session will and will not spend money on. "lite" only
// forces Cloudflare *bindings* local — AI chat, web search, and PDF extraction
// reach paid APIs over plain HTTPS with an API key, so no profile affects them.
if (devProfile === "lite") {
	console.log(
		"dev profile: lite — bindings local, no containers. No Cloudflare charges, no real email.\n" +
			"  Still billed when their keys are set: AI chat (gateway), web search, PDF extraction.\n" +
			"  Need containers, browser rendering, or real R2? pnpm dev:full",
	);
} else {
	console.log(
		"dev profile: full — remote AI, Browser, Email and the real staging R2 bucket are live.\n" +
			"  This session bills real usage and can deliver real email.",
	);
}

const appOrigin = process.env.BETTER_AUTH_URL?.trim() || `http://localhost:${localPostgres.port}`;
const serverCommand = [
	"env",
	`BETTER_AUTH_URL=${appOrigin}`,
	`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=${localDatabaseUrl}`,
	`THINKEX_DEV_PROFILE=${devProfile}`,
	// Miniflare's local trace store grows without bound under .wrangler/state and
	// nothing in the app reads it. Keep it off unless we asked for the full profile.
	...(devProfile === "lite" ? ["X_LOCAL_OBSERVABILITY=false"] : []),
	"pnpm",
	"exec",
	"vp",
	"dev",
	"--host",
	"0.0.0.0",
	"--port",
	localPostgres.port,
];
// Deliberately no `--watch`: it polls every 10s and, on any secret change,
// SIGTERMs and respawns this whole command. That is a full cold start — prebundle
// validation, Miniflare boot, container check — not a hot reload, and it fires on
// a change the developer did not make. Restart by hand when a secret rotates.
const [command, args] =
	secretsMode === "infisical"
		? ["infisical", ["run", "--env=dev", "--path=/app", "--", ...serverCommand]]
		: [serverCommand[0], serverCommand.slice(1)];
const child = spawn(command, args, {
	env: {
		...process.env,
		INFISICAL_DISABLE_UPDATE_CHECK: "true",
	},
	stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
	console.error(error);
	process.exitCode = 1;
});

child.once("exit", (code, signal) => {
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}

	process.exitCode = code ?? 1;
});

function run(command, args, env) {
	const result = spawnSync(command, args, { env, stdio: "inherit" });

	if (result.error) {
		throw result.error;
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
