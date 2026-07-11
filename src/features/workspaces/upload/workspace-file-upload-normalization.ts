import { convertImageFileToJpeg } from "#/features/workspaces/conversion/image-file-converter";
import { convertOfficeFileToPdf } from "#/features/workspaces/conversion/office-pdf-converter";
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

export interface PreparedWorkspaceFileUpload {
	body: ArrayBuffer | File;
	contentType: string;
	descriptor: WorkspaceFileTypeDescriptor;
	fileName: string;
	fileSize: number;
	source?: {
		conversion: WorkspaceUploadConversion;
		fileName: string;
		mimeType: string | null;
		sizeBytes: number;
	};
}

type WorkspaceUploadConverter = (
	env: Cloudflare.Env,
	input: { file: File; fileName: string },
) => Promise<{ bytes: ArrayBuffer; contentType: string; sizeBytes: number }>;

const defaultConverters = {
	heic_to_jpeg: convertImageFileToJpeg,
	office_to_pdf: convertOfficeFileToPdf,
} satisfies Record<WorkspaceUploadConversion, WorkspaceUploadConverter>;

export async function prepareWorkspaceFileUpload(input: {
	converters?: Record<WorkspaceUploadConversion, WorkspaceUploadConverter>;
	descriptor: WorkspaceFileTypeDescriptor;
	env: Cloudflare.Env;
	file: File;
}): Promise<PreparedWorkspaceFileUpload> {
	const conversion = resolveWorkspaceUploadConversion({
		fileName: input.file.name,
		contentType: input.file.type,
	});
	const prepared = conversion
		? await prepareConvertedWorkspaceFileUpload(input, conversion)
		: {
				body: input.file,
				contentType: input.file.type || "application/octet-stream",
				descriptor: input.descriptor,
				fileName: input.file.name,
				fileSize: input.file.size,
			};

	await validatePreparedWorkspaceFileUpload(prepared);
	return prepared;
}

async function prepareConvertedWorkspaceFileUpload(
	input: {
		converters?: Record<WorkspaceUploadConversion, WorkspaceUploadConverter>;
		descriptor: WorkspaceFileTypeDescriptor;
		env: Cloudflare.Env;
		file: File;
	},
	conversion: WorkspaceUploadConversion,
): Promise<PreparedWorkspaceFileUpload> {
	const converters = input.converters ?? defaultConverters;
	const converted = await converters[conversion](input.env, {
		file: input.file,
		fileName: input.file.name,
	});

	if (converted.sizeBytes > workspaceFileUploadLimits.maxBytesPerSelection) {
		throw new WorkspaceFileUploadError({
			code: "SELECTION_TOO_LARGE",
			message: "Converted file is outside the supported upload limit.",
			status: 413,
		});
	}

	const fileName = getWorkspaceConvertedFileName(input.file.name, conversion);
	const descriptor = requireWorkspaceFileTypeFromHint({
		fileName,
		contentType: converted.contentType,
	});

	return {
		body: converted.bytes,
		contentType: converted.contentType,
		descriptor,
		fileName,
		fileSize: converted.sizeBytes,
		source: {
			conversion,
			fileName: input.file.name,
			mimeType: input.file.type || null,
			sizeBytes: input.file.size,
		},
	};
}

async function validatePreparedWorkspaceFileUpload(input: PreparedWorkspaceFileUpload) {
	if (input.descriptor.assetKind !== "pdf") {
		return;
	}

	const bytes = input.body instanceof File ? await input.body.arrayBuffer() : input.body;
	await assertReadablePdfUpload(bytes);
}
