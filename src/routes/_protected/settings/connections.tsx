import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettingsPage } from "#/features/account/connections/ConnectionsSettingsPage";
import { getMcpServerUrlFn } from "#/features/account/connections/mcp-setup.functions";

export const Route = createFileRoute("/_protected/settings/connections")({
	loader: async () => ({
		mcpServerUrl: await getMcpServerUrlFn(),
	}),
	head: () => ({
		meta: [
			{
				title: "ThinkEx | Connections",
			},
		],
	}),
	component: ConnectionsRoutePage,
});

function ConnectionsRoutePage() {
	const { mcpServerUrl } = Route.useLoaderData();

	return <ConnectionsSettingsPage mcpServerUrl={mcpServerUrl} />;
}
