import { type JsonValue } from "#/features/workspaces/contracts";
import { withDocumentPreviewMetadata } from "#/features/workspaces/documents/document-preview-text";

export function prepareDocumentItemMetadata(
	metadataJson: Record<string, JsonValue>,
	content: string,
) {
	return withDocumentPreviewMetadata(metadataJson, content);
}
