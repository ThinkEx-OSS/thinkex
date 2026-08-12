import { isRecord } from "#/lib/record";

const aiThreadToolUiMetadataKey = "__thinkexUi";

interface AIThreadToolUiMetadata {
	documentEditReceiptId?: string;
}

export function attachDocumentEditReceiptMetadata(output: unknown, receiptId: string) {
	if (!isRecord(output)) {
		return output;
	}

	return {
		...output,
		[aiThreadToolUiMetadataKey]: {
			documentEditReceiptId: receiptId,
		} satisfies AIThreadToolUiMetadata,
	};
}

export function getDocumentEditReceiptMetadata(output: unknown) {
	if (!isRecord(output)) {
		return undefined;
	}

	const metadata = output[aiThreadToolUiMetadataKey];
	if (!isRecord(metadata)) {
		return undefined;
	}

	return typeof metadata.documentEditReceiptId === "string"
		? metadata.documentEditReceiptId
		: undefined;
}

export function stripAIThreadToolUiMetadata(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(stripAIThreadToolUiMetadata);
	}
	if (!isRecord(value)) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value).flatMap(([key, entry]) =>
			key === aiThreadToolUiMetadataKey ? [] : [[key, stripAIThreadToolUiMetadata(entry)]],
		),
	);
}
