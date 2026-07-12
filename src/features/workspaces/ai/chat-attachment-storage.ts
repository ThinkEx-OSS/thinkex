import type { UIMessage } from "ai";

const CHAT_ATTACHMENT_PREFIX = "chat-attachments";

export interface ChatAttachmentIdentity {
	attachmentId: string;
	threadId: string;
	workspaceId: string;
}

export interface StoredChatAttachmentIdentity extends ChatAttachmentIdentity {
	userId: string;
}

export function getChatAttachmentObjectKey(identity: StoredChatAttachmentIdentity) {
	return `${getChatAttachmentThreadPrefix(identity)}${encodeURIComponent(identity.attachmentId)}`;
}

export function getChatAttachmentWorkspacePrefix(workspaceId: string) {
	return `${CHAT_ATTACHMENT_PREFIX}/workspaces/${encodeURIComponent(workspaceId)}/`;
}

export function getChatAttachmentThreadPrefix(input: {
	threadId: string;
	userId: string;
	workspaceId: string;
}) {
	return `${getChatAttachmentWorkspacePrefix(input.workspaceId)}users/${encodeURIComponent(input.userId)}/threads/${encodeURIComponent(input.threadId)}/attachments/`;
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

export async function deleteChatAttachmentsForThread(
	bucket: R2Bucket,
	input: { threadId: string; userId: string; workspaceId: string },
) {
	const prefix = getChatAttachmentThreadPrefix(input);
	let cursor: string | undefined;

	do {
		const page = await bucket.list({ cursor, prefix });
		const keys = page.objects.map((object) => object.key);

		if (keys.length > 0) {
			await bucket.delete(keys);
		}

		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}

export async function copyChatAttachmentsForThread(
	bucket: R2Bucket,
	input: {
		sourceThreadId: string;
		sourceUserId: string;
		targetThreadId: string;
		targetUserId: string;
		workspaceId: string;
	},
) {
	if (input.sourceThreadId === input.targetThreadId && input.sourceUserId === input.targetUserId) {
		return;
	}

	const sourcePrefix = getChatAttachmentThreadPrefix({
		threadId: input.sourceThreadId,
		userId: input.sourceUserId,
		workspaceId: input.workspaceId,
	});
	const targetPrefix = getChatAttachmentThreadPrefix({
		threadId: input.targetThreadId,
		userId: input.targetUserId,
		workspaceId: input.workspaceId,
	});
	let cursor: string | undefined;

	do {
		const page = await bucket.list({ cursor, prefix: sourcePrefix });

		for (const listed of page.objects) {
			const object = await bucket.get(listed.key);
			if (!object) {
				throw new Error(`Chat attachment "${listed.key}" disappeared during account linking.`);
			}

			await bucket.put(
				`${targetPrefix}${listed.key.slice(sourcePrefix.length)}`,
				await object.arrayBuffer(),
				{
					customMetadata: object.customMetadata,
					httpMetadata: object.httpMetadata,
				},
			);
		}

		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor);
}

export function rebindChatAttachmentMessageUrls(
	messages: UIMessage[],
	input: { sourceThreadId: string; targetThreadId: string; workspaceId: string },
) {
	if (input.sourceThreadId === input.targetThreadId) {
		return messages;
	}

	return messages.map((message) => ({
		...message,
		parts: message.parts.map((part) => {
			if (part.type !== "file") {
				return part;
			}

			const identity = parseChatAttachmentContentUrl(part.url);
			if (
				!identity ||
				identity.threadId !== input.sourceThreadId ||
				identity.workspaceId !== input.workspaceId
			) {
				return part;
			}

			return {
				...part,
				url: getChatAttachmentContentUrl({
					...identity,
					threadId: input.targetThreadId,
				}),
			};
		}),
	}));
}
