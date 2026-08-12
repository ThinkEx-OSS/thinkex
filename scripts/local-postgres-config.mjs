export function getLocalPostgresConfig(environment = process.env) {
	const configuredPort = environment.CONDUCTOR_PORT?.trim() || "3000";
	const portNumber = Number(configuredPort);

	if (!/^\d+$/.test(configuredPort) || portNumber < 1 || portNumber > 65_535) {
		throw new Error("CONDUCTOR_PORT must be a valid local TCP port.");
	}
	const port = String(portNumber);

	const workspaceId = environment.CONDUCTOR_WORKSPACE_ID?.toLowerCase()
		.replaceAll(/[^a-z0-9]/g, "")
		.slice(0, 12);
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
