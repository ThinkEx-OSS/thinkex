export function getLocalPostgresConfig(environment = process.env) {
	const port = environment.CONDUCTOR_PORT?.trim() || "3000";

	if (!/^\d{2,5}$/.test(port)) {
		throw new Error("CONDUCTOR_PORT must be a numeric local port.");
	}

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
