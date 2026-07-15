import { convertImageStreamToJpeg } from "#/features/workspaces/conversion/image-file-converter";
import { convertOfficeStreamToPdf } from "#/features/workspaces/conversion/office-pdf-converter";
import {
	createWorkspaceFilePreview,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
} from "#/features/workspaces/files/workspace-file-preview";
import {
	getWorkspaceConvertedFileName,
	requireWorkspaceFileTypeFromHint,
	resolveWorkspaceUploadConversion,
	type WorkspaceFileTypeDescriptor,
	WorkspaceFileUploadError,
	type WorkspaceUploadConversion,
	workspaceFileUploadLimits,
} from "#/features/workspaces/model/workspace-file";
import { putFixedLengthR2Object } from "#/lib/r2";

export interface StoredWorkspaceFileUpload {
	contentType: string;
	descriptor: WorkspaceFileTypeDescriptor;
	fileName: string;
	fileSize: number;
	objectKey: string;
	preview?: {
		objectKey: string;
		sizeBytes: number;
		sourceHash: string;
	};
	source?: {
		conversion: WorkspaceUploadConversion;
		fileName: string;
		mimeType: string | null;
		sizeBytes: number;
	};
}

export type WorkspaceUploadStreamConverter = (
	env: Cloudflare.Env,
	input: {
		body: ReadableStream<Uint8Array>;
		contentType: string;
		fileName: string;
		sizeBytes: number;
	},
) => Promise<{ body: ReadableStream<Uint8Array>; sizeBytes: number }>;

const defaultConverters = {
	heic_to_jpeg: convertImageStreamToJpeg,
	office_to_pdf: convertOfficeStreamToPdf,
} satisfies Record<WorkspaceUploadConversion, WorkspaceUploadStreamConverter>;

interface FinalizeWorkspaceFileUploadStorageInput {
	contentType: string;
	converters?: Record<WorkspaceUploadConversion, WorkspaceUploadStreamConverter>;
	descriptor: WorkspaceFileTypeDescriptor;
	env: Cloudflare.Env;
	finalObjectKey: string;
	fileName: string;
	fileSize: number;
	previewObjectKey: string;
	uploadedObject: R2ObjectBody;
	uploadedObjectKey: string;
}

export async function finalizeWorkspaceFileUploadStorage(
	input: FinalizeWorkspaceFileUploadStorageInput,
): Promise<StoredWorkspaceFileUpload> {
	const conversion = resolveWorkspaceUploadConversion({
		fileName: input.fileName,
		contentType: input.contentType,
	});

	try {
		const upload = conversion
			? await convertAndStoreWorkspaceFileUpload(input, conversion)
			: adoptCanonicalWorkspaceFileUpload(input);

		if (upload.fileSize > workspaceFileUploadLimits.maxFileBytes) {
			throw createConvertedFileSizeError();
		}

		const object = conversion
			? await input.env.WORKSPACE_KERNEL_FILES.get(input.finalObjectKey)
			: input.uploadedObject;

		if (!object) {
			throw new Error("Stored workspace file could not be read for preview generation.");
		}

		return {
			...upload,
			preview: await storeWorkspaceFileUploadPreview(input, upload, object),
		};
	} catch (error) {
		if (conversion || error instanceof WorkspaceFileUploadError) {
			await input.env.WORKSPACE_KERNEL_FILES.delete(input.finalObjectKey);
		}
		throw error;
	}
}

async function storeWorkspaceFileUploadPreview(
	input: FinalizeWorkspaceFileUploadStorageInput,
	upload: StoredWorkspaceFileUpload,
	object: R2ObjectBody,
) {
	if (!upload.descriptor.previewGenerator) {
		return undefined;
	}

	const preview = await createWorkspaceFilePreview(input.env, {
		assetKind: upload.descriptor.assetKind,
		body: object.body,
		contentType: upload.contentType,
		sizeBytes: object.size,
	});
	const stored = await putFixedLengthR2Object(
		input.env.WORKSPACE_KERNEL_FILES,
		input.previewObjectKey,
		preview,
		{ httpMetadata: { contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } },
	);

	if (!stored) {
		throw new Error("Workspace file preview could not be stored.");
	}

	return {
		objectKey: input.previewObjectKey,
		sizeBytes: stored.size,
		sourceHash: object.etag,
	};
}

function adoptCanonicalWorkspaceFileUpload(
	input: FinalizeWorkspaceFileUploadStorageInput,
): StoredWorkspaceFileUpload {
	if (input.uploadedObjectKey !== input.finalObjectKey) {
		throw new Error("Pass-through workspace uploads must already use their permanent object key.");
	}
	if (input.uploadedObject.size !== input.fileSize) {
		throw new Error("Stored workspace file size did not match the upload request.");
	}

	return {
		contentType: input.contentType || "application/octet-stream",
		descriptor: input.descriptor,
		fileName: input.fileName,
		fileSize: input.uploadedObject.size,
		objectKey: input.finalObjectKey,
	};
}

async function convertAndStoreWorkspaceFileUpload(
	input: FinalizeWorkspaceFileUploadStorageInput,
	conversion: WorkspaceUploadConversion,
): Promise<StoredWorkspaceFileUpload> {
	if (input.uploadedObjectKey === input.finalObjectKey) {
		throw new Error("Converted workspace uploads must use a temporary input object.");
	}

	const converters = input.converters ?? defaultConverters;
	const response = await converters[conversion](input.env, {
		body: input.uploadedObject.body,
		contentType: input.contentType,
		fileName: input.fileName,
		sizeBytes: input.fileSize,
	});
	const contentType = getConvertedContentType(conversion);
	const fileName = getWorkspaceConvertedFileName(input.fileName, conversion);
	const descriptor = requireWorkspaceFileTypeFromHint({ fileName, contentType });
	const stored = await putFixedLengthR2Object(
		input.env.WORKSPACE_KERNEL_FILES,
		input.finalObjectKey,
		response,
		{ httpMetadata: { contentType } },
	);

	if (!stored) {
		throw new Error("Workspace file could not be stored.");
	}
	if (stored.size === 0) {
		throw new Error("Workspace file conversion produced an empty file.");
	}

	return {
		contentType,
		descriptor,
		fileName,
		fileSize: stored.size,
		objectKey: input.finalObjectKey,
		source: {
			conversion,
			fileName: input.fileName,
			mimeType: input.contentType || null,
			sizeBytes: input.fileSize,
		},
	};
}

function getConvertedContentType(conversion: WorkspaceUploadConversion) {
	return conversion === "office_to_pdf" ? "application/pdf" : "image/jpeg";
}

function createConvertedFileSizeError(): WorkspaceFileUploadError {
	return new WorkspaceFileUploadError({
		code: "SELECTION_TOO_LARGE",
		message: "Converted file is outside the supported upload limit.",
		status: 413,
	});
}
