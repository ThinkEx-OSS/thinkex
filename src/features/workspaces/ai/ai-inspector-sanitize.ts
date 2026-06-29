const MAX_STRING_LENGTH = 6000;
const MAX_ARRAY_LENGTH = 80;
const MAX_OBJECT_KEYS = 80;
const MAX_DEPTH = 8;

export function serializeInspectorPayload(value: unknown) {
	return JSON.stringify(sanitizeInspectorValue(value));
}

export function sanitizeInspectorValue(value: unknown): unknown {
	return sanitizeValue(value, 0, new WeakSet<object>());
}

export function getInspectorErrorPayload(error: unknown) {
	if (error instanceof Error) {
		return sanitizeInspectorValue({
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
	}

	return sanitizeInspectorValue(error);
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (typeof value === "string") {
		return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
	}

	if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
		return typeof value === "bigint" ? value.toString() : value;
	}

	if (typeof value === "function" || typeof value === "symbol") {
		return `[${typeof value}]`;
	}

	if (depth >= MAX_DEPTH) {
		return "[max-depth]";
	}

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	if (typeof value !== "object") {
		return value;
	}

	if (seen.has(value)) {
		return "[circular]";
	}

	seen.add(value);

	if (Array.isArray(value)) {
		return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => sanitizeValue(entry, depth + 1, seen));
	}

	const output: Record<string, unknown> = {};
	const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

	for (const [key, entry] of entries) {
		output[key] = sanitizeValue(entry, depth + 1, seen);
	}

	return output;
}
