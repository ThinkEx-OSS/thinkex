import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettingsPage } from "#/features/account/connections/ConnectionsSettingsPage";

export const Route = createFileRoute("/_protected/settings/connections")({
	head: () => ({
		meta: [
			{
				title: "ThinkEx | Connections",
			},
		],
	}),
	component: ConnectionsSettingsPage,
});
