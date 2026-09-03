import { normalizeImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
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
	preview: {
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

type PreparedWorkspaceFileUpload = Omit<StoredWorkspaceFileUpload, "preview">;

interface FinalizeWorkspaceFileUploadStorageInput {
	contentType: string;
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
			? await input.env.WORKSPACE_FILES.get(input.finalObjectKey)
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
			await input.env.WORKSPACE_FILES.delete(input.finalObjectKey);
		}
		throw error;
	}
}

async function storeWorkspaceFileUploadPreview(
	input: FinalizeWorkspaceFileUploadStorageInput,
	upload: PreparedWorkspaceFileUpload,
	object: R2ObjectBody,
) {
	const preview = await createWorkspaceFilePreview(input.env, {
		assetKind: upload.descriptor.assetKind,
		body: object.body,
		contentType: upload.contentType,
		sizeBytes: object.size,
	});
	const stored = await putFixedLengthR2Object(
		input.env.WORKSPACE_FILES,
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
): PreparedWorkspaceFileUpload {
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
): Promise<PreparedWorkspaceFileUpload> {
	if (input.uploadedObjectKey === input.finalObjectKey) {
		throw new Error("Converted workspace uploads must use a temporary input object.");
	}

	const { contentType, response } = await convertWorkspaceFileUpload(input, conversion);
	const fileName = getWorkspaceConvertedFileName(input.fileName, conversion);
	const descriptor = requireWorkspaceFileTypeFromHint({ fileName, contentType });
	const stored = await putFixedLengthR2Object(
		input.env.WORKSPACE_FILES,
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

async function convertWorkspaceFileUpload(
	input: FinalizeWorkspaceFileUploadStorageInput,
	conversion: WorkspaceUploadConversion,
) {
	if (conversion === "office_to_pdf") {
		return {
			contentType: "application/pdf",
			response: await convertOfficeStreamToPdf(input.env, {
				openBody: createReplayableUploadBody(input),
				contentType: input.contentType,
				fileName: input.fileName,
				sizeBytes: input.fileSize,
			}),
		};
	}

	return {
		contentType: "image/jpeg",
		response: await normalizeImageToJpeg(
			input.env,
			input.uploadedObject.body,
			workspaceFileUploadLimits.maxImageFileBytes,
		),
	};
}

// Streams the uploaded object on the first attempt, then re-reads it from R2 for any
// retry. This keeps the conversion streaming instead of buffering the whole upload.
function createReplayableUploadBody(input: FinalizeWorkspaceFileUploadStorageInput) {
	let initial: ReadableStream<Uint8Array> | null = input.uploadedObject.body;

	return async () => {
		if (initial) {
			const body = initial;
			initial = null;
			return body;
		}

		const object = await input.env.WORKSPACE_FILES.get(input.uploadedObjectKey);
		if (!object) {
			throw new Error("Uploaded workspace file could not be re-read for conversion.");
		}

		return object.body;
	};
}

function createConvertedFileSizeError(): WorkspaceFileUploadError {
	return new WorkspaceFileUploadError({
		code: "SELECTION_TOO_LARGE",
		message: "Converted file is outside the supported upload limit.",
		status: 413,
	});
}
