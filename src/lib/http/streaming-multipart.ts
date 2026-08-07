export function createStreamingMultipartFile(input: {
	body: ReadableStream<Uint8Array>;
	contentType: string;
	fields?: Record<string, string>;
	fileName: string;
	formFieldName: string;
	sizeBytes: number;
}) {
	const boundary = `thinkex-${crypto.randomUUID()}`;
	const encoder = new TextEncoder();
	const fieldParts = Object.entries(input.fields ?? {}).map(
		([name, value]) =>
			`--${boundary}\r\nContent-Disposition: form-data; name="${sanitizePartValue(name)}"\r\n\r\n${value}\r\n`,
	);
	const filePart = `--${boundary}\r\nContent-Disposition: form-data; name="${sanitizePartValue(input.formFieldName)}"; filename="${sanitizePartValue(input.fileName)}"\r\nContent-Type: ${input.contentType}\r\n\r\n`;
	const prefix = encoder.encode(fieldParts.join("") + filePart);
	const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
	const stream = new FixedLengthStream(prefix.byteLength + input.sizeBytes + suffix.byteLength);
	const done = pipeMultipartBody(stream.writable, input.body, prefix, suffix);

	return {
		body: stream.readable,
		contentType: `multipart/form-data; boundary=${boundary}`,
		// Callers must await their request through this rather than awaiting the body
		// pump alongside it. An endpoint that answers before draining the request body
		// — a 4xx, a redirect, a quota rejection — leaves the writer parked on
		// backpressure that will never clear, so the response, not the pump, decides
		// when the upload is over. Pump failures still surface: they break the body,
		// which fails the request.
		awaitResponse<T>(response: Promise<T>): Promise<T> {
			return Promise.race([response, done.then(() => response)]);
		},
	};
}

async function pipeMultipartBody(
	destination: WritableStream<Uint8Array>,
	source: ReadableStream<Uint8Array>,
	prefix: Uint8Array,
	suffix: Uint8Array,
) {
	const writer = destination.getWriter();
	const reader = source.getReader();

	try {
		await writer.write(prefix);

		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			await writer.write(value);
		}

		await writer.write(suffix);
		await writer.close();
	} catch (error) {
		await Promise.allSettled([reader.cancel(error), writer.abort(error)]);
		throw error;
	} finally {
		reader.releaseLock();
		writer.releaseLock();
	}
}

function sanitizePartValue(value: string) {
	return value.replace(/["\r\n\\]/g, "_");
}
