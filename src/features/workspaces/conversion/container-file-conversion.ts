import { createStreamingMultipartFile } from "#/lib/http/streaming-multipart";
import { requireSizedResponseBody } from "#/lib/http/sized-response-body";

type FileConversionContainer = {
	fetch(request: Request): Promise<Response>;
	startAndWaitForPorts(input: {
		cancellationOptions: { portReadyTimeoutMS: number };
	}): Promise<void>;
};

// A busy converter answers a queued job with 429 instead of waiting its turn. Retry
// a few times with backoff so a transient queue-full response never fails the upload.
const queueFullStatus = 429;
const maxQueueFullRetries = 3;
const baseRetryDelayMs = 250;
const maxRetryDelayMs = 5_000;

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

	// Buffer the body once so each retry can rebuild a fresh request. The upload
	// size is already bounded before it reaches here.
	const bytes = new Uint8Array(await new Response(input.body).arrayBuffer());

	for (let attempt = 0; ; attempt++) {
		const multipart = createStreamingMultipartFile({
			body: createBytesStream(bytes),
			contentType: input.contentType,
			fileName: input.fileName,
			formFieldName: input.formFieldName,
			sizeBytes: bytes.byteLength,
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

		if (response.ok) {
			return requireSizedResponseBody(response, () => input.error(input.emptyMessage));
		}

		if (response.status === queueFullStatus && attempt < maxQueueFullRetries) {
			await response.body?.cancel().catch(() => undefined);
			await delay(retryDelayMs(attempt, response));
			continue;
		}

		throw input.error(await getConversionErrorMessage(response));
	}
}

function createBytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
}

function retryDelayMs(attempt: number, response: Response) {
	const backoff = baseRetryDelayMs * 2 ** attempt;
	const header = response.headers.get("retry-after");
	const hintedSeconds = header ? Number(header) : Number.NaN;
	const hinted = Number.isFinite(hintedSeconds) ? Math.max(0, hintedSeconds * 1000) : backoff;
	return Math.min(hinted, maxRetryDelayMs);
}

function delay(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function getConversionErrorMessage(response: Response) {
	const fallback = `File conversion failed with status ${response.status}.`;
	const body = await response.text().catch(() => "");
	const message = body.trim();

	return message ? `${fallback} ${message}` : fallback;
}
