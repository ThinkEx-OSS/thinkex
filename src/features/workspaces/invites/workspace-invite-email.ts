import { workspaceRoleLabels } from "#/features/workspaces/contracts";
import type { WorkspaceRole } from "#/features/workspaces/invites/workspace-invite-rules";
import { buildInviteUrl } from "#/lib/app-origin";
import {
	escapeHtml,
	getEmailSender,
	getTransactionalFromEmail,
	TRANSACTIONAL_FROM_NAME,
} from "#/lib/transactional-email";

export type WorkspaceInviteEmailDeliveryFailureReason = "missing_binding" | "send_failed";

export interface WorkspaceInviteEmailDeliveryFailure {
	email: string;
	reason: WorkspaceInviteEmailDeliveryFailureReason;
}

export interface WorkspaceInviteEmailPayload {
	email: string;
	token: string;
	role: WorkspaceRole;
}

export function buildWorkspaceInviteEmailContent(input: {
	inviterName: string;
	workspaceName: string;
	role: WorkspaceRole;
	inviteUrl: string;
}) {
	const inviterName = input.inviterName.trim() || "Someone";
	const workspaceName = input.workspaceName.trim() || "a workspace";
	const roleLabel = workspaceRoleLabels[input.role];
	const subject = `${inviterName} invited you to ${workspaceName} on ThinkEx`;
	const text = [
		`${inviterName} invited you to join "${workspaceName}" on ThinkEx as ${roleLabel}.`,
		"",
		`Accept the invite: ${input.inviteUrl}`,
	].join("\n");
	const html = [
		`<p>${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(workspaceName)}</strong> on ThinkEx as ${escapeHtml(roleLabel)}.</p>`,
		`<p><a href="${escapeHtml(input.inviteUrl)}">Accept invite</a></p>`,
		`<p>Or copy this link: ${escapeHtml(input.inviteUrl)}</p>`,
	].join("");

	return { subject, text, html };
}

export async function sendWorkspaceInviteEmails(input: {
	invites: WorkspaceInviteEmailPayload[];
	inviterName: string;
	workspaceName: string;
	appOrigin: string;
}): Promise<WorkspaceInviteEmailDeliveryFailure[]> {
	const emailSender = getEmailSender();

	if (!emailSender) {
		return input.invites.map((invite) => ({
			email: invite.email,
			reason: "missing_binding",
		}));
	}

	const fromEmail = getTransactionalFromEmail();

	const sendResults = await Promise.all(
		input.invites.map(async (invite) => {
			const inviteUrl = buildInviteUrl(invite.token, input.appOrigin);
			const content = buildWorkspaceInviteEmailContent({
				inviterName: input.inviterName,
				workspaceName: input.workspaceName,
				role: invite.role,
				inviteUrl,
			});

			try {
				await emailSender.send({
					to: invite.email,
					from: {
						email: fromEmail,
						name: TRANSACTIONAL_FROM_NAME,
					},
					subject: content.subject,
					html: content.html,
					text: content.text,
				});
				return null;
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown send error";
				const code = error instanceof Error && "code" in error ? String(error.code) : undefined;

				console.warn("[WorkspaceInviteEmail] Send failed", {
					email: invite.email,
					code,
					message,
				});

				return {
					email: invite.email,
					reason: "send_failed",
				} satisfies WorkspaceInviteEmailDeliveryFailure;
			}
		}),
	);

	return sendResults.flatMap((failure) => (failure ? [failure] : []));
}
