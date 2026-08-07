import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";

import {
	ACCOUNT_SETTINGS_TABS,
	AccountSettingsDialog,
	type AccountSettingsTab,
} from "#/features/account/components/AccountSettingsDialog";
import { UpgradeDialog } from "#/features/account/components/UpgradeDialog";
import { getAuthSessionQueryOptions } from "#/lib/session-query";
import type { BillingPeriod } from "#/features/account/pricing";

/**
 * Account dialogs are search params rather than routes or hashes: they stay
 * linkable while leaving whatever the user was looking at behind the dialog.
 */
interface ProtectedSearch {
	billing?: BillingPeriod;
	settings?: AccountSettingsTab;
	upgrade?: true;
}

export const Route = createFileRoute("/_protected")({
	validateSearch: (search: Record<string, unknown>): ProtectedSearch => {
		// Annual is only reachable by asking for it explicitly; the UI offers monthly.
		const billing = search.billing === "annual" ? "annual" : "monthly";
		const settings = search.settings as AccountSettingsTab | undefined;
		const upgrade = search.upgrade === true || search.upgrade === "true";

		if (upgrade) {
			return { billing, upgrade: true };
		}

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
	const { billing, settings, upgrade } = Route.useSearch();
	const navigate = useNavigate();

	// replace: true so opening and closing settings doesn't stack history entries
	// the user then has to back out of one by one.
	const setSettings = (tab: AccountSettingsTab | undefined) => {
		void navigate({
			replace: true,
			search: (previous: ProtectedSearch) => ({
				...previous,
				billing: tab ? undefined : previous.billing,
				settings: tab,
				upgrade: tab ? undefined : previous.upgrade,
			}),
			to: ".",
		});
	};
	const setUpgrade = (open: boolean) => {
		void navigate({
			replace: true,
			search: (previous: ProtectedSearch) => ({
				...previous,
				billing: open ? previous.billing : undefined,
				upgrade: open ? (true as const) : undefined,
			}),
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
			<UpgradeDialog
				key={`${billing ?? "monthly"}:${Boolean(upgrade)}`}
				billingPeriod={billing}
				open={Boolean(upgrade)}
				onOpenChange={setUpgrade}
			/>
		</>
	);
}
