import { env as workerEnv } from "cloudflare:workers";

export const TRANSACTIONAL_FROM_EMAIL = "notifications@thinkex.app";
export const WORKSPACE_INVITE_FROM_EMAIL = "invites@thinkex.app";
export const SUPPORT_REPLY_TO_EMAIL = "hello@thinkex.app";
export const TRANSACTIONAL_FROM_NAME = "ThinkEx";

export function getTransactionalFromEmail() {
	return TRANSACTIONAL_FROM_EMAIL;
}

export function getWorkspaceInviteFromEmail() {
	return WORKSPACE_INVITE_FROM_EMAIL;
}

export function getSupportReplyToEmail() {
	return SUPPORT_REPLY_TO_EMAIL;
}

export function getEmailSender() {
	return workerEnv.EMAIL ?? null;
}

export function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
