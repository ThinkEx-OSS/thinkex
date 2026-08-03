import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";

import {
	ACCOUNT_SETTINGS_TABS,
	AccountSettingsDialog,
	type AccountSettingsTab,
} from "#/features/account/components/AccountSettingsDialog";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

/**
 * Settings is a search param rather than a route or a hash: a hash never reaches
 * the server, so a cold load would render the page and only pop the dialog in
 * after hydration. This stays linkable for upgrade prompts elsewhere in the app
 * and leaves whatever the user was looking at intact behind the dialog.
 */
interface ProtectedSearch {
	settings?: AccountSettingsTab;
}

export const Route = createFileRoute("/_protected")({
	validateSearch: (search: Record<string, unknown>): ProtectedSearch => {
		const settings = search.settings as AccountSettingsTab | undefined;

		return settings && ACCOUNT_SETTINGS_TABS.includes(settings) ? { settings } : {};
	},
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.ensureQueryData(getAuthSessionQueryOptions());

		if (!session) {
			throw redirect({
				to: "/login",
				search: {
					redirect: location.href,
				},
			});
		}

		return { session };
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	const { settings } = Route.useSearch();
	const navigate = useNavigate();

	// replace: true so opening and closing settings doesn't stack history entries
	// the user then has to back out of one by one.
	const setSettings = (tab: AccountSettingsTab | undefined) => {
		void navigate({
			replace: true,
			search: (previous: ProtectedSearch) => ({ ...previous, settings: tab }),
			to: ".",
		});
	};

	return (
		<>
			<Outlet />
			<AccountSettingsDialog
				open={Boolean(settings)}
				onOpenChange={(next) => {
					setSettings(next ? (settings ?? "account") : undefined);
				}}
				onTabChange={setSettings}
				tab={settings ?? "account"}
			/>
		</>
	);
}
