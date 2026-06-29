export interface WorkspaceUploadHint {
	fileName: string;
	contentType?: string | null;
}

export interface WorkspaceDeniedUploadFormat {
	ext: string;
	mime: string;
	message: string;
}

export const workspaceDeniedUploadFormats = [
	{
		ext: "svg",
		mime: "image/svg+xml",
		message: "SVG files are not supported.",
	},
] as const satisfies readonly WorkspaceDeniedUploadFormat[];

export function matchesUploadHint(
	format: Pick<WorkspaceDeniedUploadFormat, "ext" | "mime">,
	input: WorkspaceUploadHint,
) {
	const fileName = normalizeUploadFileName(input.fileName);
	const contentType = normalizeUploadContentType(input.contentType);

	return (
		fileName.endsWith(`.${format.ext}`) || (contentType !== null && contentType === format.mime)
	);
}

export function getDeniedWorkspaceUploadMessage(input: WorkspaceUploadHint) {
	const denied = workspaceDeniedUploadFormats.find((format) => matchesUploadHint(format, input));

	return denied?.message ?? null;
}

export function normalizeUploadFileName(fileName: string) {
	return fileName.trim().toLowerCase();
}

export function normalizeUploadContentType(contentType?: string | null) {
	const normalized = contentType?.trim().toLowerCase() ?? null;

	return normalized || null;
}
