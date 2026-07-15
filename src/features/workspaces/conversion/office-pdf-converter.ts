import { Container, getRandom } from "@cloudflare/containers";

import { convertFileStreamWithContainer } from "#/features/workspaces/conversion/container-file-conversion";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";

const gotenbergPort = 3000;
const gotenbergLibreOfficeConvertPath = "/forms/libreoffice/convert";
const converterPoolSize = 2;

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

export class OfficePdfConversionError extends WorkspaceFileConversionError {
	constructor(message: string) {
		super(message, "Unable to convert this file to PDF right now.");
		this.name = "OfficePdfConversionError";
	}
}

export async function convertOfficeStreamToPdf(
	env: Cloudflare.Env,
	input: {
		body: ReadableStream<Uint8Array>;
		contentType: string;
		fileName: string;
		sizeBytes: number;
	},
) {
	const converter = await getRandom(env.OFFICE_PDF_CONVERTER, converterPoolSize);

	return convertFileStreamWithContainer({
		...input,
		container: converter,
		emptyMessage: "Office file conversion returned an empty PDF.",
		error: (message) => new OfficePdfConversionError(message),
		formFieldName: "files",
		url: `http://office-pdf-converter${gotenbergLibreOfficeConvertPath}`,
	});
}
