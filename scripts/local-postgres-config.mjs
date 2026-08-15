export function getLocalPostgresConfig(environment = process.env) {
	const configuredPort = environment.CONDUCTOR_PORT?.trim() || "3000";
	const portNumber = Number(configuredPort);

	if (!/^\d+$/.test(configuredPort) || portNumber < 1 || portNumber > 65_535) {
		throw new Error("CONDUCTOR_PORT must be a valid local TCP port.");
	}
	const port = String(portNumber);

	const workspaceId = environment.CONDUCTOR_WORKSPACE_ID?.toLowerCase().replaceAll(
		/[^a-z0-9]/g,
		"",
	);
	const databaseKey = workspaceId ? `${port}_${workspaceId}` : port;
	const databaseName = `thinkex_${databaseKey}`;
	const roleName = `thinkex_local_${databaseKey}`;

	return {
		databaseName,
		port,
		roleName,
		url: `postgresql://${roleName}:${roleName}@localhost:5432/${databaseName}`,
	};
}

/**
 * The database this checkout actually uses, which is not always the derived one:
 * a preset CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE wins, and
 * run-local-dev.mjs then skips provisioning and migration entirely.
 *
 * Every caller that needs to know "which database is this checkout's" must go
 * through here rather than re-deriving it. clean-local-dev.mjs decides what is
 * safe to drop from this answer, so a second, half-complete copy of the rule is
 * how you delete a database somebody is using.
 *
 * `databaseName` is undefined when an explicit URL is set but unparseable —
 * callers that delete must treat that as "do not touch anything".
 */
export function resolveLocalDatabase(environment = process.env) {
	const derived = getLocalPostgresConfig(environment);
	const configuredUrl =
		environment.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE?.trim();

	if (!configuredUrl) {
		return { ...derived, isConfigured: false };
	}

	return {
		...derived,
		databaseName: databaseNameFromUrl(configuredUrl),
		url: configuredUrl,
		isConfigured: true,
	};
}

function databaseNameFromUrl(url) {
	try {
		const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
		return name || undefined;
	} catch {
		return undefined;
	}
}
