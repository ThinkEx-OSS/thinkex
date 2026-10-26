const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const MAX_ERROR_STACK_LENGTH = 4_000;

type ErrorRecord = Record<string, unknown>;

export interface OperationalErrorFields {
	error_cause_message?: string;
	error_cause_type?: string;
	error_code?: number | string;
	error_message?: string;
	error_overloaded?: boolean;
	error_retryable?: boolean;
	error_stack?: string;
	error_type: string;
}

export function buildOperationalErrorFields(error: unknown): OperationalErrorFields {
	const record = isErrorRecord(error) ? error : undefined;
	const cause = isErrorRecord(record?.cause) ? record.cause : undefined;

	return {
		error_cause_message: normalizeText(getErrorMessage(cause), MAX_ERROR_MESSAGE_LENGTH),
		error_cause_type: getErrorType(cause),
		error_code: getStringOrNumber(record?.code),
		error_message: normalizeText(getErrorMessage(error), MAX_ERROR_MESSAGE_LENGTH),
		error_overloaded: getBoolean(record?.overloaded),
		error_retryable: getBoolean(record?.retryable),
		error_stack: normalizeText(getString(record?.stack), MAX_ERROR_STACK_LENGTH),
		error_type: getErrorType(error) ?? "UnknownError",
	};
}

/**
 * A drizzle `DrizzleQueryError` builds its message from the SQL statement and the
 * bound parameters. Those parameters carry request data — a user id among them —
 * so every caller produces a distinct message and error tracking splinters a
 * single fault into one issue per parameter value. Rebuild it from the statement
 * alone, keep the driver error as the cause so the real reason survives, and keep
 * the original frames so the origin still resolves. Other errors pass through.
 */
export function normalizeCapturedError(error: unknown): unknown {
	if (!isErrorRecord(error)) {
		return error;
	}

	const statement = getString(error.query);

	if (!statement || !Array.isArray(error.params)) {
		return error;
	}

	const normalized = new Error(statement, { cause: error.cause });
	normalized.name = "DrizzleQueryError";
	normalized.stack = buildStatementStack(statement, getString(error.stack));

	return normalized;
}

function buildStatementStack(statement: string, originalStack: string | undefined) {
	const header = `DrizzleQueryError: ${statement}`;

	if (!originalStack) {
		return header;
	}

	// Drop the original message header (it holds the parameters) but keep the
	// stack frames beneath it.
	const framesIndex = originalStack.search(/\n\s+at /);

	return framesIndex === -1 ? header : `${header}${originalStack.slice(framesIndex)}`;
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	return isErrorRecord(error) ? getString(error.message) : undefined;
}

function getErrorType(error: unknown) {
	if (error instanceof Error) {
		return error.name;
	}

	return isErrorRecord(error) ? getString(error.name) : undefined;
}

function getBoolean(value: unknown) {
	return typeof value === "boolean" ? value : undefined;
}

function getString(value: unknown) {
	return typeof value === "string" ? value : undefined;
}

function getStringOrNumber(value: unknown) {
	return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function isErrorRecord(value: unknown): value is ErrorRecord {
	return typeof value === "object" && value !== null;
}

function normalizeText(value: string | undefined, maxLength: number) {
	const normalized = value?.replace(/\s+/g, " ").trim();

	if (!normalized) {
		return undefined;
	}

	return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}
