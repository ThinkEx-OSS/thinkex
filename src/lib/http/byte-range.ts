export class ByteRangeNotSatisfiableError extends Error {
	constructor(readonly sizeBytes: number) {
		super("Requested byte range is not satisfiable.");
		this.name = "ByteRangeNotSatisfiableError";
	}
}

export function parseByteRange(value: string | null, sizeBytes: number): R2Range | null {
	if (!value) {
		return null;
	}

	const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
	if (!match || (!match[1] && !match[2])) {
		throw new ByteRangeNotSatisfiableError(sizeBytes);
	}

	if (!match[1]) {
		const suffix = parseByteCount(match[2], sizeBytes);
		if (suffix === 0) {
			throw new ByteRangeNotSatisfiableError(sizeBytes);
		}
		return { suffix: Math.min(suffix, sizeBytes) };
	}

	const offset = parseByteCount(match[1], sizeBytes);
	if (offset >= sizeBytes) {
		throw new ByteRangeNotSatisfiableError(sizeBytes);
	}

	if (!match[2]) {
		return { offset, length: sizeBytes - offset };
	}

	const requestedEnd = parseByteCount(match[2], sizeBytes);
	if (requestedEnd < offset) {
		throw new ByteRangeNotSatisfiableError(sizeBytes);
	}

	const end = Math.min(requestedEnd, sizeBytes - 1);
	return { offset, length: end - offset + 1 };
}

function parseByteCount(value: string | undefined, sizeBytes: number) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0 || !Number.isSafeInteger(sizeBytes)) {
		throw new ByteRangeNotSatisfiableError(sizeBytes);
	}
	return parsed;
}
