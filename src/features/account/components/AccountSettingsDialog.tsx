import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { AccountSection } from "#/features/account/components/AccountSection";
import { PlanBillingSection } from "#/features/account/components/PlanBillingSection";
import { signOutCurrentUser } from "#/lib/auth-sign-out";
import { getErrorMessage } from "#/lib/error-message";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

export const ACCOUNT_SETTINGS_TABS = ["account", "plan"] as const;

export type AccountSettingsTab = (typeof ACCOUNT_SETTINGS_TABS)[number];

const TAB_TRIGGER =
	"justify-start rounded-sm px-2 py-1.5 data-active:bg-accent data-active:text-accent-foreground data-active:shadow-none! dark:data-active:border-transparent dark:data-active:bg-accent";

interface AccountSettingsDialogProps {
	onOpenChange: (open: boolean) => void;
	onTabChange: (tab: AccountSettingsTab) => void;
	open: boolean;
	tab: AccountSettingsTab;
}

export function AccountSettingsDialog({
	onOpenChange,
	onTabChange,
	open,
	tab,
}: AccountSettingsDialogProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = useQuery(getAuthSessionQueryOptions());

	const user = session?.user;

	const handleSignOut = async () => {
		try {
			await signOutCurrentUser({ queryClient, router, navigate });
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to sign out right now."));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="gap-0 p-0 sm:max-w-2xl">
				<DialogHeader className="border-b border-border px-5 py-5">
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription className="sr-only">
						Manage your account, plan, and data.
					</DialogDescription>
				</DialogHeader>

				{/* Vertical nav on desktop, a horizontal strip on phones — a fixed side
				    rail is what makes settings modals unusable on small screens. */}
				<Tabs
					value={tab}
					onValueChange={(value) => onTabChange(value as AccountSettingsTab)}
					orientation="vertical"
					className="flex-col gap-0 sm:flex-row"
				>
					{/* The divider lives on this wrapper, not on TabsList: TabsTrigger is
					    flex-1, so stretching the list to full height makes the tabs share
					    it equally and drift apart. The list keeps its natural height and
					    sits at the top. */}
					<div className="shrink-0 border-b border-border p-2 sm:w-48 sm:border-r sm:border-b-0">
						{/* No track: bg-transparent on the list, and the active tab reads as
						    a filled row like a dropdown item rather than a raised pill. */}
						<TabsList className="w-full gap-0.5 bg-transparent p-0 sm:flex-col">
							{/* shadow-none needs ! because the variant's shadow selector is more
							    specific than a bare data-active override. */}
							<TabsTrigger value="account" className={TAB_TRIGGER}>
								Account
							</TabsTrigger>
							<TabsTrigger value="plan" className={TAB_TRIGGER}>
								Plan &amp; usage
							</TabsTrigger>
						</TabsList>
					</div>

					{/* Fixed height, not min-height: a floor only holds while every tab
					    happens to fit under it, so it silently starts drifting again as
					    soon as one grows. A fixed height is always that height; max-h
					    clamps it on short viewports, and anything taller scrolls inside. */}
					<div className="h-[26rem] max-h-[65vh] min-w-0 flex-1 overflow-y-auto p-5">
						{/* Deleting the account lives under Account rather than its own tab —
						    one destructive row doesn't justify a section of its own. */}
						<TabsContent value="account">
							<AccountSection
								createdAt={user?.createdAt}
								email={user?.email}
								image={user?.image}
								name={user?.name}
								onSignOut={() => {
									void handleSignOut();
								}}
							/>
						</TabsContent>
						<TabsContent value="plan">
							<PlanBillingSection />
						</TabsContent>
					</div>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
