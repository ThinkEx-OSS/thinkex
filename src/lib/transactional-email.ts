import { env as workerEnv } from "cloudflare:workers";

export const TRANSACTIONAL_FROM_EMAIL = "invites@thinkex.app";
export const TRANSACTIONAL_FROM_NAME = "ThinkEx";

export function getTransactionalFromEmail() {
	return workerEnv.WORKSPACE_INVITE_FROM_EMAIL?.trim() || TRANSACTIONAL_FROM_EMAIL;
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
