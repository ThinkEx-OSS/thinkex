import type { FileUIPart, SourceDocumentUIPart } from "ai";

export type FileAttachmentData = {
	id: string;
	type: "file";
	filename?: string;
	mediaType: string;
	status: "loading" | "ready";
	url?: string;
};

export type AttachmentData = FileAttachmentData | (SourceDocumentUIPart & { id: string });

export type AttachmentMediaCategory =
	| "image"
	| "video"
	| "audio"
	| "document"
	| "source"
	| "unknown";

export const getMediaCategory = (data: AttachmentData): AttachmentMediaCategory => {
	if (data.type === "source-document") {
		return "source";
	}

	const mediaType = data.mediaType ?? "";

	if (mediaType.startsWith("image/")) {
		return "image";
	}

	if (mediaType.startsWith("video/")) {
		return "video";
	}

	if (mediaType.startsWith("audio/")) {
		return "audio";
	}

	if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
		return "document";
	}

	return "unknown";
};

export const getAttachmentLabel = (data: AttachmentData): string => {
	if (data.type === "source-document") {
		return data.title || data.filename || "Source";
	}

	const category = getMediaCategory(data);
	return data.filename || (category === "image" ? "Image" : "Attachment");
};

export function toSendableFileParts(files: readonly FileAttachmentData[]): FileUIPart[] {
	return files
		.filter(
			(file): file is FileAttachmentData & { url: string } =>
				file.status === "ready" && Boolean(file.url),
		)
		.map(({ id: _id, status: _status, ...part }) => part);
}
