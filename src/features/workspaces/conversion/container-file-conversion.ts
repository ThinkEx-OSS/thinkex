import { createStreamingMultipartFile } from "#/lib/http/streaming-multipart";
import { requireSizedResponseBody } from "#/lib/http/sized-response-body";

type FileConversionContainer = {
	fetch(request: Request): Promise<Response>;
	startAndWaitForPorts(input: {
		cancellationOptions: { portReadyTimeoutMS: number };
	}): Promise<void>;
};

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

	const response = await multipart.awaitResponse(
		input.container.fetch(
			new Request(input.url, {
				body: multipart.body,
				duplex: "half",
				headers: { "content-type": multipart.contentType },
				method: "POST",
			} as RequestInit & { duplex: "half" }),
		),
	);

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
