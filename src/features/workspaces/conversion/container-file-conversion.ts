import { createStreamingMultipartFile } from "#/lib/http/streaming-multipart";
import { requireSizedResponseBody } from "#/lib/http/sized-response-body";

type FileConversionContainer = {
	fetch(request: Request): Promise<Response>;
	startAndWaitForPorts(input: {
		cancellationOptions: { portReadyTimeoutMS: number };
	}): Promise<void>;
};

export async function convertFileWithContainer(input: {
	container: FileConversionContainer;
	emptyMessage: string;
	error: (message: string) => Error;
	file: File;
	fileName: string;
	formFieldName: string;
	url: string;
}): Promise<ArrayBuffer> {
	const response = await convertFileStreamWithContainer({
		...input,
		body: input.file.stream(),
		contentType: input.file.type || "application/octet-stream",
		sizeBytes: input.file.size,
	});
	const bytes = await new Response(response.body).arrayBuffer();

	if (bytes.byteLength === 0) {
		throw input.error(input.emptyMessage);
	}

	return bytes;
}

export async function convertFileStreamWithContainer(input: {
	container: FileConversionContainer;
	body: ReadableStream<Uint8Array>;
	contentType: string;
	emptyMessage: string;
	error: (message: string) => Error;
	fileName: string;
	formFieldName: string;
	sizeBytes: number;
	url: string;
}) {
	await input.container.startAndWaitForPorts({
		cancellationOptions: {
			portReadyTimeoutMS: 60_000,
		},
	});

	const multipart = createStreamingMultipartFile({
		body: input.body,
		contentType: input.contentType,
		fileName: input.fileName,
		formFieldName: input.formFieldName,
		sizeBytes: input.sizeBytes,
	});

	const [response] = await Promise.all([
		input.container.fetch(
			new Request(input.url, {
				body: multipart.body,
				duplex: "half",
				headers: { "content-type": multipart.contentType },
				method: "POST",
			} as RequestInit & { duplex: "half" }),
		),
		multipart.done,
	]);

	if (!response.ok) {
		throw input.error(await getConversionErrorMessage(response));
	}

	return requireSizedResponseBody(response, () => input.error(input.emptyMessage));
}

async function getConversionErrorMessage(response: Response) {
	const fallback = `File conversion failed with status ${response.status}.`;
	const body = await response.text().catch(() => "");
	const message = body.trim();

	return message ? `${fallback} ${message}` : fallback;
}
