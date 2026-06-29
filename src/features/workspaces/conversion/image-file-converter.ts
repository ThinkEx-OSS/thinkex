import { Container, getRandom } from "@cloudflare/containers";

import { convertFileWithContainer } from "#/features/workspaces/conversion/container-file-conversion";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";

const imageConverterPort = 8080;
const imageConverterPath = "/convert/jpeg";
const jpegContentType = "image/jpeg";
const converterPoolSize = 1;

export class ImageFileConverter extends Container {
	defaultPort = imageConverterPort;
	requiredPorts = [imageConverterPort];
	sleepAfter = "5m";
	enableInternet = false;
}

export interface ConvertImageFileToJpegInput {
	file: File;
	fileName: string;
}

export interface ConvertImageFileToJpegResult {
	bytes: ArrayBuffer;
	contentType: typeof jpegContentType;
	sizeBytes: number;
}

export class ImageFileConversionError extends WorkspaceFileConversionError {
	constructor(message: string) {
		super(message, "Unable to convert this image right now.");
		this.name = "ImageFileConversionError";
	}
}

export async function convertImageFileToJpeg(
	env: Cloudflare.Env,
	input: ConvertImageFileToJpegInput,
): Promise<ConvertImageFileToJpegResult> {
	const converter = await getRandom(env.IMAGE_FILE_CONVERTER, converterPoolSize);
	const bytes = await convertFileWithContainer({
		container: converter,
		emptyMessage: "Image conversion returned an empty JPEG.",
		error: (message) => new ImageFileConversionError(message),
		file: input.file,
		fileName: input.fileName,
		formFieldName: "file",
		url: `http://image-file-converter${imageConverterPath}`,
	});

	return {
		bytes,
		contentType: jpegContentType,
		sizeBytes: bytes.byteLength,
	};
}
