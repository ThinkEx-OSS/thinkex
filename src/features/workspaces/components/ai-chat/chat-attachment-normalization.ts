import { readFileAsDataUrl } from "#/lib/read-file-as-data-url";

export interface NormalizedChatAttachmentFile {
	fileName: string;
	mediaType: string;
	url: string;
}

export async function normalizeWorkspaceAiChatAttachmentFile(input: {
	file: File;
	workspaceId: string;
}): Promise<NormalizedChatAttachmentFile> {
	const formData = new FormData();
	formData.set("file", input.file, input.file.name);

	const response = await fetch(
		`/api/v1/workspaces/${input.workspaceId}/chat-attachment-normalization`,
		{
			body: formData,
			method: "POST",
		},
	);

	if (!response.ok) {
		throw new Error(await getChatAttachmentNormalizationError(response));
	}

	const blob = await response.blob();
	const encodedFileName = response.headers.get("x-attachment-filename");

	return {
		fileName: encodedFileName ? decodeURIComponent(encodedFileName) : input.file.name,
		mediaType: blob.type || response.headers.get("content-type") || "image/jpeg",
		url: await readFileAsDataUrl(blob),
	};
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
