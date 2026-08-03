import { useNavigate } from "@tanstack/react-router";
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

export function DeleteAccountSection() {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [isPending, setIsPending] = useState(false);

	const handleDeleteAccount = async () => {
		setIsPending(true);

		try {
			const result = await authClient.deleteUser();

			if (result.error) {
				throw result.error;
			}

			setOpen(false);
			await navigate({ to: "/account-deleted", replace: true });
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to delete your account right now."));
		} finally {
			setIsPending(false);
		}
	};

	return (
		<>
			{/* No heading and no blurb: the consequences live in the confirm dialog,
			    which is where someone actually needs to read them. */}

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
							members will lose access to those workspaces and their contents. This action cannot be
							undone.
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
		</>
	);
}
