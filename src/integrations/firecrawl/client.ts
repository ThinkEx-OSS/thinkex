const defaultFirecrawlApiUrl = "https://api.firecrawl.dev";

export async function firecrawlJsonRequest(input: {
	env: Cloudflare.Env;
	path: string;
	operation: string;
	method?: string;
	body?: BodyInit | null;
	headers?: HeadersInit;
}) {
	const headers = new Headers({
		Authorization: `Bearer ${input.env.FIRECRAWL_API_KEY}`,
	});
	new Headers(input.headers).forEach((value, key) => {
		headers.set(key, value);
	});

	const response = await fetch(getFirecrawlUrl(input.env, input.path), {
		method: input.method ?? "GET",
		headers,
		body: input.body,
	});
	const responseJson = (await response.json().catch(() => null)) as unknown;

	if (!response.ok) {
		throw new Error(
			`${input.operation} failed (${response.status}): ${getFirecrawlErrorMessage(responseJson)}`,
		);
	}

	return responseJson;
}

export function getFirecrawlApiUrl(env: Cloudflare.Env) {
	return (env.FIRECRAWL_API_URL || defaultFirecrawlApiUrl).replace(/\/$/, "");
}

export function getFirecrawlUrl(env: Cloudflare.Env, path: string) {
	const baseUrl = `${getFirecrawlApiUrl(env)}/`;
	return new URL(path.replace(/^\/+/, ""), baseUrl);
}

export function getFirecrawlErrorMessage(value: unknown) {
	const error = getRecordValue(value, "error");
	const message = getRecordValue(value, "message");

	if (typeof error === "string") {
		return error;
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

export function getFirstArrayRecord(value: unknown) {
	return Array.isArray(value) ? (value[0] ?? null) : null;
}

export function getStringValue(value: unknown, key: string) {
	const field = getRecordValue(value, key);
	return typeof field === "string" && field.trim().length > 0 ? field : null;
}

export function getNumberValue(value: unknown, key: string) {
	const field = getRecordValue(value, key);
	return typeof field === "number" ? field : null;
}

export function getBooleanValue(value: unknown, key: string) {
	const field = getRecordValue(value, key);
	return typeof field === "boolean" ? field : null;
}

export function truncateFirecrawlText(value: string | null, maxLength: number) {
	if (!value || value.length <= maxLength) {
		return value;
	}

	return `${value.slice(0, maxLength)}...`;
}
