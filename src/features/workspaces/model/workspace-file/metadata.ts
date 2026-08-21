import type { JsonValue } from "#/features/workspaces/contracts";

export function getMetadataString(metadata: Record<string, JsonValue>, key: string) {
	const value = metadata[key];

	return typeof value === "string" ? value : null;
}

export function getMetadataNumber(metadata: Record<string, JsonValue>, key: string) {
	const value = metadata[key];

	return typeof value === "number" ? value : null;
}

/**
 * The item this file rides inside — set for images pasted into a document or
 * card, null for files the user uploaded directly. Owned files stay out of
 * listings and the upload meter, and are purged with their owner when no
 * surviving item still embeds them.
 */
export function getMetadataOwnerItemId(metadata: Record<string, JsonValue>) {
	return getMetadataString(metadata, "ownerItemId");
}
