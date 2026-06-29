import type { JsonValue } from "#/features/workspaces/contracts";

export function getMetadataString(metadata: Record<string, JsonValue>, key: string) {
	const value = metadata[key];

	return typeof value === "string" ? value : null;
}

export function getMetadataNumber(metadata: Record<string, JsonValue>, key: string) {
	const value = metadata[key];

	return typeof value === "number" ? value : null;
}
