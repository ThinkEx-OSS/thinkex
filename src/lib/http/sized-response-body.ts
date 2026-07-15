export interface SizedResponseBody {
	body: ReadableStream<Uint8Array>;
	sizeBytes: number;
}

export function requireSizedResponseBody(
	response: Response,
	createError: () => Error,
): SizedResponseBody {
	if (!response.body) {
		throw createError();
	}

	const sizeBytes = Number(response.headers.get("content-length"));
	if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
		throw createError();
	}

	return { body: response.body, sizeBytes };
}
