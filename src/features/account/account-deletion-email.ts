import {
	escapeHtml,
	getEmailSender,
	getTransactionalFromEmail,
	TRANSACTIONAL_FROM_NAME,
} from "#/lib/transactional-email";

export type DeleteAccountEmailDeliveryFailureReason = "missing_binding" | "send_failed";

export interface DeleteAccountEmailDeliveryResult {
	ok: true;
}

export interface DeleteAccountEmailDeliveryFailure {
	ok: false;
	reason: DeleteAccountEmailDeliveryFailureReason;
}

export type DeleteAccountEmailDeliveryOutcome =
	| DeleteAccountEmailDeliveryResult
	| DeleteAccountEmailDeliveryFailure;

export function buildDeleteAccountEmailContent(input: { deleteUrl: string }) {
	const subject = "Confirm deletion of your ThinkEx account";
	const text = [
		"You requested to permanently delete your ThinkEx account.",
		"",
		"This will also delete every workspace you own and the data inside them.",
		"",
		`Confirm account deletion: ${input.deleteUrl}`,
		"",
		"If you did not request this, you can ignore this email.",
	].join("\n");
	const html = [
		"<p>You requested to permanently delete your ThinkEx account.</p>",
		"<p><strong>Every workspace you own will also be deleted.</strong></p>",
		`<p><a href="${escapeHtml(input.deleteUrl)}">Confirm account deletion</a></p>`,
		`<p>Or copy this link: ${escapeHtml(input.deleteUrl)}</p>`,
		"<p>If you did not request this, you can ignore this email.</p>",
	].join("");

	return { subject, text, html };
}

export async function sendDeleteAccountVerificationEmail(input: {
	email: string;
	url: string;
}): Promise<DeleteAccountEmailDeliveryOutcome> {
	const emailSender = getEmailSender();

	if (!emailSender) {
		console.warn("[DeleteAccountEmail] EMAIL binding is not configured");
		return { ok: false, reason: "missing_binding" };
	}

	const content = buildDeleteAccountEmailContent({ deleteUrl: input.url });

	try {
		await emailSender.send({
			to: input.email,
			from: {
				email: getTransactionalFromEmail(),
				name: TRANSACTIONAL_FROM_NAME,
			},
			subject: content.subject,
			html: content.html,
			text: content.text,
		});
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown send error";
		const code = error instanceof Error && "code" in error ? String(error.code) : undefined;

		console.warn("[DeleteAccountEmail] Send failed", {
			email: input.email,
			code,
			message,
		});

		return { ok: false, reason: "send_failed" };
	}
}
