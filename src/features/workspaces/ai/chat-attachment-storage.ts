// Chat attachment addressing. Bytes live in Postgres (ai_chat_attachments);
// these helpers only build and parse the content URLs message parts carry.

export interface ChatAttachmentIdentity {
	attachmentId: string;
	threadId: string;
	workspaceId: string;
}

export function getChatAttachmentContentUrl(identity: ChatAttachmentIdentity) {
	return `/api/v1/workspaces/${encodeURIComponent(identity.workspaceId)}/ai-threads/${encodeURIComponent(identity.threadId)}/attachments/${encodeURIComponent(identity.attachmentId)}`;
}

export function parseChatAttachmentContentUrl(value: string): ChatAttachmentIdentity | null {
	let url: URL;

	try {
		url = new URL(value, "https://thinkex.invalid");
	} catch {
		return null;
	}

	const match = /^\/api\/v1\/workspaces\/([^/]+)\/ai-threads\/([^/]+)\/attachments\/([^/]+)$/.exec(
		url.pathname,
	);

	if (!match?.[1] || !match[2] || !match[3]) {
		return null;
	}

	try {
		return {
			attachmentId: decodeURIComponent(match[3]),
			threadId: decodeURIComponent(match[2]),
			workspaceId: decodeURIComponent(match[1]),
		};
	} catch {
		return null;
	}
}
