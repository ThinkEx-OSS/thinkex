import { spawn, spawnSync } from "node:child_process";

import { getLocalPostgresConfig } from "./local-postgres-config.mjs";

const secretsMode = process.argv.includes("--infisical") ? "infisical" : "environment";
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

const appOrigin = process.env.BETTER_AUTH_URL?.trim() || `http://localhost:${localPostgres.port}`;
const serverCommand = [
	"env",
	`BETTER_AUTH_URL=${appOrigin}`,
	`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=${localDatabaseUrl}`,
	"pnpm",
	"exec",
	"vp",
	"dev",
	"--host",
	"0.0.0.0",
	"--port",
	localPostgres.port,
];
const [command, args] =
	secretsMode === "infisical"
		? ["infisical", ["run", "--env=dev", "--path=/app", "--watch", "--", ...serverCommand]]
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
