import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "#/features/account/components/SettingsPage";

export const Route = createFileRoute("/_protected/settings")({
	head: () => ({
		meta: [
			{
				title: "ThinkEx | Settings",
			},
		],
	}),
	component: SettingsPage,
});
