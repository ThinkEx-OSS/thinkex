import { Container, getRandom } from "@cloudflare/containers";

import { convertFileWithContainer } from "#/features/workspaces/conversion/container-file-conversion";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";

const gotenbergPort = 3000;
const gotenbergLibreOfficeConvertPath = "/forms/libreoffice/convert";
const pdfContentType = "application/pdf";
const converterPoolSize = 1;

export class OfficePdfConverter extends Container {
	defaultPort = gotenbergPort;
	requiredPorts = [gotenbergPort];
	sleepAfter = "5m";
	enableInternet = false;
	envVars = {
		LIBREOFFICE_AUTO_START: "true",
		LIBREOFFICE_MAX_QUEUE_SIZE: "1",
		LIBREOFFICE_START_TIMEOUT: "60s",
	};
}

export interface ConvertOfficeFileToPdfInput {
	file: File;
	fileName: string;
}

export interface ConvertOfficeFileToPdfResult {
	bytes: ArrayBuffer;
	contentType: typeof pdfContentType;
	sizeBytes: number;
}

export class OfficePdfConversionError extends WorkspaceFileConversionError {
	constructor(message: string) {
		super(message, "Unable to convert this file to PDF right now.");
		this.name = "OfficePdfConversionError";
	}
}

export async function convertOfficeFileToPdf(
	env: Cloudflare.Env,
	input: ConvertOfficeFileToPdfInput,
): Promise<ConvertOfficeFileToPdfResult> {
	const converter = await getRandom(env.OFFICE_PDF_CONVERTER, converterPoolSize);
	const bytes = await convertFileWithContainer({
		container: converter,
		emptyMessage: "Office file conversion returned an empty PDF.",
		error: (message) => new OfficePdfConversionError(message),
		file: input.file,
		fileName: input.fileName,
		formFieldName: "files",
		url: `http://office-pdf-converter${gotenbergLibreOfficeConvertPath}`,
	});

	return {
		bytes,
		contentType: pdfContentType,
		sizeBytes: bytes.byteLength,
	};
}
