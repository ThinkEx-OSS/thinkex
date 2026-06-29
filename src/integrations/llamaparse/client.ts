const defaultLlamaCloudApiUrl = "https://api.cloud.llamaindex.ai";

export async function llamaCloudJsonRequest(input: {
	env: Env;
	path: string;
	operation: string;
	method?: string;
	body?: BodyInit | null;
	headers?: HeadersInit;
}) {
	const headers = new Headers({
		Accept: "application/json",
		Authorization: `Bearer ${input.env.LLAMA_CLOUD_API_KEY}`,
	});
	new Headers(input.headers).forEach((value, key) => {
		headers.set(key, value);
	});

	const response = await fetch(getLlamaCloudUrl(input.path), {
		method: input.method ?? "GET",
		headers,
		body: input.body,
	});
	const responseJson = (await response.json().catch(() => null)) as unknown;

	if (!response.ok) {
		throw new Error(
			`${input.operation} failed (${response.status}): ${getLlamaCloudErrorMessage(responseJson)}`,
		);
	}

	return responseJson;
}

export function getLlamaCloudApiUrl() {
	return defaultLlamaCloudApiUrl;
}

export function getLlamaCloudUrl(path: string) {
	const baseUrl = `${getLlamaCloudApiUrl()}/`;
	return new URL(path.replace(/^\/+/, ""), baseUrl);
}

export function getLlamaCloudErrorMessage(value: unknown) {
	const error = getRecordValue(value, "error");
	const detail = getRecordValue(value, "detail");
	const message = getRecordValue(value, "message");

	if (typeof error === "string") {
		return error;
	}

	if (typeof detail === "string") {
		return detail;
	}

	if (typeof message === "string") {
		return message;
	}

	return "unknown error";
}

export function getRecordValue(value: unknown, key: string) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	return (value as Record<string, unknown>)[key] ?? null;
}

export function getRecordArrayValue(value: unknown, key: string) {
	const field = getRecordValue(value, key);
	return Array.isArray(field) ? field : [];
}

export function getStringValue(value: unknown, key: string) {
	const field = getRecordValue(value, key);
	return typeof field === "string" && field.trim().length > 0 ? field : null;
}

export function getNumberValue(value: unknown, key: string) {
	const field = getRecordValue(value, key);
	return typeof field === "number" ? field : null;
}
