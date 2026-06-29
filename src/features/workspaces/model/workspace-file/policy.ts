import { FileText, Image, type LucideIcon } from "lucide-react";

import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";
import type {
	WorkspaceFileAiReadStrategy,
	WorkspaceFileAssetKind,
	WorkspaceFileExtractionRoute,
	WorkspaceFilePreviewGeneratorId,
} from "#/features/workspaces/model/workspace-file/types";
import {
	getDeniedWorkspaceUploadMessage,
	normalizeUploadContentType,
	normalizeUploadFileName,
	type WorkspaceUploadHint,
} from "#/features/workspaces/upload/matching";

export type WorkspaceFileUploadHint = WorkspaceUploadHint;

export interface WorkspaceUploadFormat {
	ext: string;
	mime: string;
	assetKind: WorkspaceFileAssetKind;
	aiReadStrategy?: WorkspaceFileAiReadStrategy;
	conversion?: WorkspaceUploadConversion;
}

export type WorkspaceUploadConversion = "heic_to_jpeg" | "office_to_pdf";

export interface WorkspaceUploadFamily {
	assetKind: WorkspaceFileAssetKind;
	label: string;
	pluralLabel: string;
	icon: LucideIcon;
	defaultFileName: string;
	aiReadStrategy: WorkspaceFileAiReadStrategy;
	requiresHeavyViewerRuntime: boolean;
	previewGenerator: WorkspaceFilePreviewGeneratorId | null;
	extractionRoute: WorkspaceFileExtractionRoute;
}

export interface WorkspaceFileTypeDescriptor extends WorkspaceUploadFamily {
	extensions: readonly { ext: string; mime: string }[];
}

export type WorkspaceFileUploadValidationErrorCode =
	| "INVALID_UPLOAD"
	| "UNSUPPORTED_FILE_TYPE"
	| "UPLOAD_TOO_LARGE"
	| "TOO_MANY_FILES"
	| "SELECTION_TOO_LARGE";

export interface WorkspaceFileUploadValidationError {
	code: WorkspaceFileUploadValidationErrorCode;
	message: string;
	status: 400 | 413;
}

export class WorkspaceFileUploadError extends Error {
	readonly code: WorkspaceFileUploadValidationError["code"];
	readonly status: WorkspaceFileUploadValidationError["status"];

	constructor(validationError: WorkspaceFileUploadValidationError) {
		super(validationError.message);
		this.name = "WorkspaceFileUploadError";
		this.code = validationError.code;
		this.status = validationError.status;
	}
}

/**
 * Explicit upload allowlist. Add or remove formats here; everything else is rejected.
 * Do not use broad MIME wildcards (e.g. image/*) — they bypass this list.
 */
export const workspaceFileUploadFormats = [
	{ ext: "pdf", mime: "application/pdf", assetKind: "pdf" },
	{
		ext: "docx",
		mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		assetKind: "pdf",
		conversion: "office_to_pdf",
	},
	{
		ext: "pptx",
		mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		assetKind: "pdf",
		conversion: "office_to_pdf",
	},
	{ ext: "png", mime: "image/png", assetKind: "image" },
	{ ext: "jpg", mime: "image/jpeg", assetKind: "image" },
	{ ext: "jpeg", mime: "image/jpeg", assetKind: "image" },
	{ ext: "webp", mime: "image/webp", assetKind: "image" },
	{ ext: "heic", mime: "image/heic", assetKind: "image", conversion: "heic_to_jpeg" },
	{ ext: "heif", mime: "image/heif", assetKind: "image", conversion: "heic_to_jpeg" },
] as const satisfies readonly WorkspaceUploadFormat[];

const WORKSPACE_UPLOAD_FAMILIES = [
	{
		assetKind: "pdf",
		label: "PDF",
		pluralLabel: "PDFs",
		icon: FileText,
		defaultFileName: "Uploaded file.pdf",
		aiReadStrategy: "markdown_extraction",
		requiresHeavyViewerRuntime: true,
		previewGenerator: "pdf_webp",
		extractionRoute: {
			provider: "llama_parse",
			mode: "agentic",
			reason: "default_pdf_upload_route",
		},
	},
	{
		assetKind: "image",
		label: "Image",
		pluralLabel: "images",
		icon: Image,
		defaultFileName: "Uploaded image.png",
		aiReadStrategy: "markdown_extraction",
		requiresHeavyViewerRuntime: false,
		previewGenerator: "image_webp",
		extractionRoute: {
			provider: "workers_ai_to_markdown",
			mode: "default",
			reason: "default_image_upload_route",
		},
	},
] as const satisfies readonly WorkspaceUploadFamily[];

const workspaceUploadFamilyByKind: Record<WorkspaceFileAssetKind, WorkspaceFileTypeDescriptor> = {
	pdf: {
		...WORKSPACE_UPLOAD_FAMILIES[0],
		extensions: workspaceFileUploadFormats
			.filter((format) => format.assetKind === "pdf")
			.map(({ ext, mime }) => ({ ext, mime })),
	},
	image: {
		...WORKSPACE_UPLOAD_FAMILIES[1],
		extensions: workspaceFileUploadFormats
			.filter((format) => format.assetKind === "image")
			.map(({ ext, mime }) => ({ ext, mime })),
	},
};

export function requireWorkspaceFileTypeFromHint(
	input: WorkspaceFileUploadHint,
): WorkspaceFileTypeDescriptor {
	const descriptor = resolveWorkspaceFileTypeFromHint(input);

	if (!descriptor) {
		throw new WorkspaceFileUploadError({
			code: "UNSUPPORTED_FILE_TYPE",
			message: getDeniedWorkspaceUploadMessage(input) ?? "This file type is not supported.",
			status: 400,
		});
	}

	return descriptor;
}

export function resolveWorkspaceUploadFormat(
	input: WorkspaceFileUploadHint,
): WorkspaceUploadFormat | null {
	const contentType = normalizeUploadContentType(input.contentType);

	if (contentType) {
		const formatByMime = workspaceFileUploadFormats.find((format) => format.mime === contentType);

		if (formatByMime) {
			return formatByMime;
		}
	}

	const fileName = normalizeUploadFileName(input.fileName);

	return workspaceFileUploadFormats.find((format) => fileName.endsWith(`.${format.ext}`)) ?? null;
}

export function resolveWorkspaceFileTypeFromHint(
	input: WorkspaceFileUploadHint,
): WorkspaceFileTypeDescriptor | null {
	const format = resolveWorkspaceUploadFormat(input);

	if (!format) {
		return null;
	}

	return workspaceUploadFamilyByKind[format.assetKind];
}

export function resolveWorkspaceFileAiReadStrategy(input: {
	fileName: string;
	contentType?: string | null;
	descriptor: WorkspaceFileTypeDescriptor;
}): WorkspaceFileAiReadStrategy {
	const format = resolveMatchedUploadFormat(input, input.descriptor);

	return format?.aiReadStrategy ?? input.descriptor.aiReadStrategy;
}

export function resolveWorkspaceUploadConversion(
	input: WorkspaceFileUploadHint,
): WorkspaceUploadConversion | null {
	const format = resolveWorkspaceUploadFormat(input);

	return format?.conversion ?? null;
}

export function getWorkspaceConvertedFileName(
	fileName: string,
	conversion: WorkspaceUploadConversion,
) {
	const name = normalizeWorkspaceItemName(fileName.split(/[\\/]/).at(-1), "Uploaded file");
	const baseName = stripFileExtension(name);
	const extensionByConversion = {
		heic_to_jpeg: "jpg",
		office_to_pdf: "pdf",
	} satisfies Record<WorkspaceUploadConversion, string>;

	return `${baseName}.${extensionByConversion[conversion]}`;
}

export function getWorkspaceUploadFamily(
	assetKind: WorkspaceFileAssetKind,
): WorkspaceFileTypeDescriptor {
	return workspaceUploadFamilyByKind[assetKind];
}

export function normalizeWorkspaceUploadFileName(
	fileName: string,
	descriptor: WorkspaceFileTypeDescriptor,
) {
	const name = normalizeWorkspaceItemName(
		fileName.split(/[\\/]/).at(-1),
		descriptor.defaultFileName,
	);
	const matchedFormat = resolveMatchedUploadFormat({ fileName: name }, descriptor);

	if (matchedFormat) {
		return name;
	}

	const baseName = stripFileExtension(name);

	return `${baseName}.${descriptor.extensions[0]?.ext ?? "bin"}`;
}

export function resolveMatchedUploadFormat(
	input: WorkspaceFileUploadHint,
	descriptor: WorkspaceFileTypeDescriptor,
) {
	const format = resolveWorkspaceUploadFormat(input);

	if (!format || format.assetKind !== descriptor.assetKind) {
		return null;
	}

	return format;
}

export function getWorkspaceFileShellExtension(input: {
	fileName: string;
	contentType?: string | null;
	descriptor: WorkspaceFileTypeDescriptor;
}) {
	return (
		resolveMatchedUploadFormat(input, input.descriptor)?.ext ??
		input.descriptor.extensions[0]?.ext ??
		"bin"
	);
}

export function resolveWorkspaceFileContentType(input: {
	contentType?: string | null;
	descriptor: WorkspaceFileTypeDescriptor;
	fileName: string;
}) {
	const normalizedContentType = input.contentType?.trim();

	if (normalizedContentType) {
		return normalizedContentType;
	}

	return (
		resolveMatchedUploadFormat(input, input.descriptor)?.mime ??
		input.descriptor.extensions[0]?.mime ??
		"application/octet-stream"
	);
}

function stripFileExtension(fileName: string) {
	const lastDot = fileName.lastIndexOf(".");

	if (lastDot <= 0) {
		return fileName;
	}

	return fileName.slice(0, lastDot);
}
