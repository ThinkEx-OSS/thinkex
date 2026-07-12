export interface NormalizedChatAttachmentFile {
	fileName: string;
	mediaType: string;
	url: string;
}

let normalizationQueue = Promise.resolve();

export function normalizeWorkspaceAiChatAttachmentFile(input: {
	file: File;
	threadId: string;
	workspaceId: string;
}): Promise<NormalizedChatAttachmentFile> {
	const result = normalizationQueue.then(() => uploadWorkspaceAiChatAttachmentFile(input));
	normalizationQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
}

async function uploadWorkspaceAiChatAttachmentFile(input: {
	file: File;
	threadId: string;
	workspaceId: string;
}) {
	const formData = new FormData();
	formData.set("file", input.file, input.file.name);

	const response = await fetch(
		`/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/ai-threads/${encodeURIComponent(input.threadId)}/attachments`,
		{
			body: formData,
			method: "POST",
		},
	);

	if (!response.ok) {
		throw new Error(await getChatAttachmentNormalizationError(response));
	}

	return response.json<NormalizedChatAttachmentFile>();
}

export async function deleteWorkspaceAiChatAttachment(url: string): Promise<void> {
	const response = await fetch(url, { method: "DELETE" });

	if (!response.ok && response.status !== 404) {
		throw new Error("Could not discard the chat attachment.");
	}
}

async function getChatAttachmentNormalizationError(response: Response) {
	const fallback = "Could not prepare this attachment for chat.";
	const contentType = response.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = await response.json().catch((): unknown => null);
		const message =
			body && typeof body === "object" && "message" in body ? body.message : undefined;

		return typeof message === "string" && message.trim() ? message : fallback;
	}

	const message = await response.text().catch(() => "");
	return message.trim() || fallback;
}
