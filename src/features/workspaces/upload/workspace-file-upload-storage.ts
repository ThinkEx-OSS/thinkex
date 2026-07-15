import { convertImageStreamToJpeg } from "#/features/workspaces/conversion/image-file-converter";
import { convertOfficeStreamToPdf } from "#/features/workspaces/conversion/office-pdf-converter";
import {
	getWorkspaceConvertedFileName,
	requireWorkspaceFileTypeFromHint,
	resolveWorkspaceUploadConversion,
	type WorkspaceFileTypeDescriptor,
	WorkspaceFileUploadError,
	type WorkspaceUploadConversion,
	workspaceFileUploadLimits,
} from "#/features/workspaces/model/workspace-file";
import { assertReadablePdfUpload } from "#/features/workspaces/upload/pdf-upload-validation";
import { putFixedLengthR2Object } from "#/lib/r2";

export interface StoredWorkspaceFileUpload {
	contentType: string;
	descriptor: WorkspaceFileTypeDescriptor;
	fileName: string;
	fileSize: number;
	objectKey: string;
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

export async function storeWorkspaceFileUpload(input: {
	body: ReadableStream<Uint8Array>;
	contentType: string;
	converters?: Record<WorkspaceUploadConversion, WorkspaceUploadStreamConverter>;
	descriptor: WorkspaceFileTypeDescriptor;
	env: Cloudflare.Env;
	fileName: string;
	fileSize: number;
	objectKey: string;
}): Promise<StoredWorkspaceFileUpload> {
	const conversion = resolveWorkspaceUploadConversion({
		fileName: input.fileName,
		contentType: input.contentType,
	});
	const prepared = conversion
		? await convertWorkspaceFileUpload(input, conversion)
		: {
				body: input.body,
				contentType: input.contentType || "application/octet-stream",
				descriptor: input.descriptor,
				fileName: input.fileName,
				sizeBytes: input.fileSize,
				source: undefined,
			};

	try {
		const stored = await putFixedLengthR2Object(
			input.env.WORKSPACE_KERNEL_FILES,
			input.objectKey,
			prepared,
			{ httpMetadata: { contentType: prepared.contentType } },
		);

		if (!stored) {
			throw new Error("Workspace file could not be stored.");
		}
		if (stored.size === 0) {
			throw new Error("Workspace file conversion produced an empty file.");
		}

		if (!conversion && stored.size !== input.fileSize) {
			throw new Error("Stored workspace file size did not match the upload request.");
		}

		if (stored.size > workspaceFileUploadLimits.maxFileBytes) {
			throw createConvertedFileSizeError();
		}

		if (prepared.descriptor.assetKind === "pdf") {
			const object = await input.env.WORKSPACE_KERNEL_FILES.get(input.objectKey);

			if (!object) {
				throw new Error("Stored workspace PDF could not be read for validation.");
			}

			await assertReadablePdfUpload({ env: input.env, object });
		}

		return {
			contentType: prepared.contentType,
			descriptor: prepared.descriptor,
			fileName: prepared.fileName,
			fileSize: stored.size,
			objectKey: input.objectKey,
			source: prepared.source,
		};
	} catch (error) {
		await input.env.WORKSPACE_KERNEL_FILES.delete(input.objectKey);
		throw error;
	}
}

async function convertWorkspaceFileUpload(
	input: {
		body: ReadableStream<Uint8Array>;
		contentType: string;
		converters?: Record<WorkspaceUploadConversion, WorkspaceUploadStreamConverter>;
		descriptor: WorkspaceFileTypeDescriptor;
		env: Cloudflare.Env;
		fileName: string;
		fileSize: number;
	},
	conversion: WorkspaceUploadConversion,
) {
	const converters = input.converters ?? defaultConverters;
	const response = await converters[conversion](input.env, {
		body: input.body,
		contentType: input.contentType,
		fileName: input.fileName,
		sizeBytes: input.fileSize,
	});
	const contentType = getConvertedContentType(conversion);
	const fileName = getWorkspaceConvertedFileName(input.fileName, conversion);
	const descriptor = requireWorkspaceFileTypeFromHint({ fileName, contentType });

	return {
		body: response.body,
		contentType,
		descriptor,
		fileName,
		sizeBytes: response.sizeBytes,
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
