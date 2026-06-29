import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { WorkspaceShareRoleMenu } from "#/features/workspaces/components/WorkspaceShareRoleMenu";
import { getWorkspaceEmailInvitesQueryKey } from "#/features/workspaces/components/workspace-share-queries";
import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";
import { createWorkspaceEmailInvitesFn } from "#/features/workspaces/invites/workspace-invite-functions";
import {
	getDefaultInviteRole,
	getGrantableInviteRoles,
	isValidInviteEmail,
	normalizeInviteEmail,
} from "#/features/workspaces/invites/workspace-invite-rules";
import { cn } from "#/lib/utils";

export function WorkspaceShareEmailInviteField({
	membershipRole,
	workspaceId,
}: {
	membershipRole: WorkspaceMembershipRole;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const inputRef = useRef<HTMLInputElement>(null);
	const grantableRoles = useMemo(() => getGrantableInviteRoles(membershipRole), [membershipRole]);
	const [draftEmails, setDraftEmails] = useState<string[]>([]);
	const [inputValue, setInputValue] = useState("");
	const [inviteRoleSelection, setInviteRoleSelection] = useState<WorkspaceMembershipRole>(() =>
		getDefaultInviteRole(membershipRole),
	);
	const inviteRole = grantableRoles.includes(inviteRoleSelection)
		? inviteRoleSelection
		: getDefaultInviteRole(membershipRole);

	const createInvitesMutation = useMutation({
		mutationFn: createWorkspaceEmailInvitesFn,
		onSuccess: async (result) => {
			setDraftEmails([]);
			setInputValue("");

			await queryClient.invalidateQueries({
				queryKey: getWorkspaceEmailInvitesQueryKey(workspaceId),
			});

			const { delivered, persisted, failedToSend, skipped } = result;

			if (delivered.length > 0) {
				toast.success(
					delivered.length === 1
						? "Invite email sent to 1 person"
						: `Invite emails sent to ${delivered.length} people`,
				);
			} else if (persisted.length > 0) {
				toast.message(
					persisted.length === 1
						? "Invite saved, but the email could not be sent"
						: `Invites saved, but emails could not be sent to ${persisted.length} people`,
				);
			}

			if (failedToSend.length > 0 && delivered.length > 0) {
				toast.error(
					failedToSend.length === 1
						? "Could not send email to 1 address"
						: `Could not send email to ${failedToSend.length} addresses`,
				);
			}

			if (skipped.length > 0) {
				const alreadyMembers = skipped.filter((entry) => entry.reason === "already_member").length;
				const invalid = skipped.filter((entry) => entry.reason === "invalid_email").length;

				if (alreadyMembers > 0) {
					toast.message(
						alreadyMembers === 1
							? "1 person is already a member"
							: `${alreadyMembers} people are already members`,
					);
				}

				if (invalid > 0) {
					toast.error(
						invalid === 1 ? "1 email address is invalid" : `${invalid} email addresses are invalid`,
					);
				}
			}
		},
		onError: () => toast.error("Could not save invites"),
	});

	function removeDraftEmail(email: string) {
		setDraftEmails((current) => current.filter((entry) => entry !== email));
	}

	function addDraftEmail(rawEmail: string, { showErrors = false }: { showErrors?: boolean } = {}) {
		const email = normalizeInviteEmail(rawEmail);

		if (!email) {
			return false;
		}

		if (!isValidInviteEmail(email)) {
			if (showErrors) {
				toast.error("Enter a valid email address");
			}
			return false;
		}

		if (draftEmails.includes(email)) {
			if (showErrors) {
				toast.message("That email is already in the list");
			}
			return false;
		}

		setDraftEmails((current) => [...current, email]);
		return true;
	}

	function commitInputValue({ showErrors = false } = {}) {
		if (!inputValue.trim()) {
			return;
		}

		if (addDraftEmail(inputValue, { showErrors })) {
			setInputValue("");
		}
	}

	function collectEmailsToInvite() {
		const emails = [...draftEmails];
		const pendingEmail = normalizeInviteEmail(inputValue);

		if (pendingEmail && isValidInviteEmail(pendingEmail)) {
			if (!emails.includes(pendingEmail)) {
				emails.push(pendingEmail);
			}
		}

		return emails;
	}

	function handleInvite() {
		if (createInvitesMutation.isPending) {
			return;
		}

		const emails = collectEmailsToInvite();

		if (emails.length === 0) {
			toast.error("Add at least one email address");
			inputRef.current?.focus();
			return;
		}

		createInvitesMutation.mutate({
			data: {
				workspaceId,
				role: inviteRole,
				emails,
			},
		});
	}

	const hasInviteTarget =
		draftEmails.length > 0 || (inputValue.trim().length > 0 && isValidInviteEmail(inputValue));

	const showInviteControls = inputValue.length > 0 || draftEmails.length > 0;

	return (
		<div className="relative border-b">
			<div className="flex h-10 items-center px-2 pr-32">
				<label
					htmlFor="workspace-share-email"
					className="flex min-w-0 flex-1 cursor-text items-center gap-1.5 overflow-x-auto"
				>
					{draftEmails.map((email) => (
						<Badge
							key={email}
							variant="secondary"
							className="max-w-full shrink-0 gap-1 rounded-md py-1 pr-1 pl-2"
						>
							<span className="truncate">{email}</span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className="size-5 shrink-0"
								aria-label={`Remove ${email}`}
								onClick={(event) => {
									event.preventDefault();
									removeDraftEmail(email);
								}}
							>
								<X />
							</Button>
						</Badge>
					))}
					<input
						ref={inputRef}
						id="workspace-share-email"
						type="email"
						value={inputValue}
						placeholder={draftEmails.length === 0 ? "Add people by email" : "Add another"}
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						onChange={(event) => setInputValue(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === ",") {
								event.preventDefault();
								if (hasInviteTarget) {
									handleInvite();
									return;
								}

								commitInputValue({ showErrors: true });
								return;
							}

							if (event.key === "Backspace" && inputValue.length === 0 && draftEmails.length > 0) {
								setDraftEmails((current) => current.slice(0, -1));
							}
						}}
						onBlur={() => commitInputValue()}
					/>
				</label>
			</div>

			<div
				className={cn(
					"absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1 transition-opacity duration-150",
					showInviteControls ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
				)}
			>
				<WorkspaceShareRoleMenu
					onValueChange={setInviteRoleSelection}
					roles={grantableRoles}
					value={inviteRole}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="shrink-0 text-muted-foreground"
					aria-label="Send invite"
					disabled={!hasInviteTarget || createInvitesMutation.isPending}
					onClick={handleInvite}
				>
					{createInvitesMutation.isPending ? <Loader2 className="animate-spin" /> : <Send />}
				</Button>
			</div>
		</div>
	);
}
