import type { FileUIPart } from "ai";

export type FileAttachmentData = {
	id: string;
	type: "file";
	filename?: string;
	mediaType: string;
} & ({ status: "loading"; url?: never } | { status: "ready"; url: string });

// Source-document parts cannot occur in this transcript (sendSources is off);
// attachments are always file parts.
export type AttachmentData = FileAttachmentData;

export type AttachmentMediaCategory =
	| "image"
	| "video"
	| "audio"
	| "document"
	| "source"
	| "unknown";

export const getMediaCategory = (data: AttachmentData): AttachmentMediaCategory => {
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
	const category = getMediaCategory(data);
	return data.filename || (category === "image" ? "Image" : "Attachment");
};

export function getFileAttachmentData(part: FileUIPart): FileAttachmentData {
	return {
		filename: part.filename,
		id: getFileAttachmentId(part),
		mediaType: part.mediaType,
		status: "ready",
		type: "file",
		url: part.url,
	};
}

function getFileAttachmentId(part: FileUIPart): string {
	return part.url;
}

export function toSendableFileParts(files: readonly FileAttachmentData[]): FileUIPart[] {
	return files
		.filter((file): file is Extract<FileAttachmentData, { status: "ready" }> => {
			return file.status === "ready";
		})
		.map(({ id: _id, status: _status, ...part }) => part);
}
