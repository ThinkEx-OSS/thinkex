import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, LogOut, Settings } from "lucide-react";
import { toast } from "sonner";

import AppShell from "#/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { DeleteAccountSection } from "#/features/account/components/DeleteAccountSection";
import { signOutCurrentUser } from "#/lib/auth-sign-out";
import { getErrorMessage } from "#/lib/error-message";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

export function SettingsPage() {
	const navigate = useNavigate();
	const router = useRouter();
	const canGoBack = useCanGoBack();
	const queryClient = useQueryClient();
	const { data: session } = useQuery(getAuthSessionQueryOptions());

	const user = session?.user;
	const displayName = user?.name || user?.email || "User";

	const handleBack = () => {
		if (canGoBack) {
			router.history.back();
			return;
		}

		void navigate({ to: "/home" });
	};

	const handleSignOut = async () => {
		try {
			await signOutCurrentUser({
				queryClient,
				router,
				navigate,
			});
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to sign out right now."));
		}
	};

	return (
		<AppShell
			headerContext={
				<>
					<Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span className="truncate">Settings</span>
				</>
			}
		>
			<div className="mx-auto w-full max-w-lg space-y-8">
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 w-fit text-muted-foreground"
					onClick={handleBack}
				>
					<ArrowLeft className="size-4" />
					Back
				</Button>

				<div className="flex justify-center">
					<Avatar className="size-24">
						<AvatarImage src={user?.image ?? undefined} alt="" />
						<AvatarFallback className="text-2xl">
							{displayName.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</div>

				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="settings-display-name">Name</FieldLabel>
						<Input
							id="settings-display-name"
							value={displayName}
							readOnly
							className="cursor-default bg-muted/40"
						/>
					</Field>
					<Field>
						<FieldLabel htmlFor="settings-email">Email</FieldLabel>
						<Input
							id="settings-email"
							type="email"
							value={user?.email ?? ""}
							readOnly
							className="cursor-default bg-muted/40"
						/>
					</Field>
				</FieldGroup>

				<div className="border-t border-border pt-6">
					<Button
						variant="destructive"
						onClick={() => {
							void handleSignOut();
						}}
					>
						<LogOut className="size-4" />
						Sign out
					</Button>
				</div>

				<DeleteAccountSection />
			</div>
		</AppShell>
	);
}
