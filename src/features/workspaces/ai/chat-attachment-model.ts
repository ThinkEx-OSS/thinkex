import type { FilePart, ModelMessage, TextPart } from "ai";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import {
	getChatAttachmentObjectKey,
	parseChatAttachmentContentUrl,
} from "#/features/workspaces/ai/chat-attachment-storage";

export async function resolveChatAttachmentModelMessages(input: {
	bucket: R2Bucket;
	messages: ModelMessage[];
	threadId: string;
	userId: string;
	workspaceId: string;
}): Promise<ModelMessage[]> {
	let remainingBytes = WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxModelAttachmentBytes;
	const messages = [...input.messages];

	for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
		const message = messages[messageIndex];

		if (!message) {
			continue;
		}

		if (message.role !== "user" || typeof message.content === "string") {
			continue;
		}

		const content = [...message.content];
		for (let partIndex = content.length - 1; partIndex >= 0; partIndex -= 1) {
			const part = content[partIndex];

			if (!part) {
				continue;
			}

			if (part.type !== "file" || typeof part.data !== "string") {
				continue;
			}
			if (remainingBytes <= 0 && parseChatAttachmentContentUrl(part.data)) {
				content[partIndex] = omitChatAttachmentPart(part);
				continue;
			}

			const resolved = await resolveChatAttachmentPart(part, input, remainingBytes);
			content[partIndex] = resolved.part;
			remainingBytes -= resolved.bytes;
		}

		messages[messageIndex] = { ...message, content };
	}

	return messages;
}

async function resolveChatAttachmentPart(
	part: FilePart,
	input: {
		bucket: R2Bucket;
		threadId: string;
		userId: string;
		workspaceId: string;
	},
	remainingBytes: number,
): Promise<{ bytes: number; part: FilePart | TextPart }> {
	const identity = parseChatAttachmentContentUrl(part.data as string);

	if (!identity) {
		return { bytes: 0, part };
	}

	if (identity.threadId !== input.threadId || identity.workspaceId !== input.workspaceId) {
		throw new Error("Chat attachment does not belong to this thread.");
	}

	const object = await input.bucket.get(
		getChatAttachmentObjectKey({ ...identity, userId: input.userId }),
	);

	if (!object) {
		throw new Error(`Chat attachment "${part.filename ?? identity.attachmentId}" was not found.`);
	}

	if (
		object.size > WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxNormalizedFileSize ||
		object.size > remainingBytes
	) {
		return { bytes: 0, part: omitChatAttachmentPart(part) };
	}

	return {
		bytes: object.size,
		part: {
			...part,
			data: new Uint8Array(await object.arrayBuffer()),
			mediaType: object.httpMetadata?.contentType ?? part.mediaType,
		},
	};
}

function omitChatAttachmentPart(part: FilePart): TextPart {
	return {
		text: `[Earlier image omitted from model context: ${part.filename ?? "attachment"}]`,
		type: "text",
	};
}
