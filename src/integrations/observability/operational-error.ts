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
