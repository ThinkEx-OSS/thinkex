import { useState } from "react";
import { toast } from "sonner";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
import { getErrorMessage } from "#/lib/error-message";

const accountDeletedCallbackPath = "/account-deleted";

export function DeleteAccountSection() {
	const [open, setOpen] = useState(false);
	const [isPending, setIsPending] = useState(false);

	const handleDeleteAccount = async () => {
		setIsPending(true);

		try {
			const result = await authClient.deleteUser({
				callbackURL: accountDeletedCallbackPath,
			});

			if (result.error) {
				throw result.error;
			}

			setOpen(false);
			toast.success("Check your email to confirm account deletion.");
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to start account deletion right now."));
		} finally {
			setIsPending(false);
		}
	};

	return (
		<div className="space-y-3 border-t border-border pt-6">
			<div className="space-y-1">
				<h2 className="text-sm font-medium text-destructive">Danger zone</h2>
				<p className="text-sm text-muted-foreground">
					Permanently delete your ThinkEx account. Every workspace you own will also be deleted,
					including all items and files inside them. This action cannot be undone.
				</p>
			</div>

			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogTrigger
					render={
						<Button variant="destructive" disabled={isPending}>
							Delete account
						</Button>
					}
				/>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete your account?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes your ThinkEx account and every workspace you own. Other
							members will lose access to those workspaces and their contents. You will receive a
							verification email before deletion completes.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isPending}
							onClick={(event) => {
								event.preventDefault();
								void handleDeleteAccount();
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
