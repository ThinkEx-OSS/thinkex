import type { JsonValue, WorkspaceItemType } from "#/features/workspaces/contracts";
import { withDocumentPreviewMetadata } from "#/features/workspaces/documents/document-preview-text";
import {
	createInitialTiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getWorkspaceItemRegistryEntry } from "#/features/workspaces/workspace-item-registry";

export function prepareDocumentItemMetadata(
	metadataJson: Record<string, JsonValue>,
	content: string,
) {
	return withDocumentPreviewMetadata(metadataJson, content);
}

/** Shared create-time content + metadata for kernel writes and optimistic UI. */
export function buildWorkspaceItemCreateBootstrap(input: {
	type: WorkspaceItemType;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
}) {
	const initialContent = input.initialContent ?? getInitialWorkspaceContent(input.type);
	const metadataJson =
		input.type === "document"
			? prepareDocumentItemMetadata(input.metadataJson ?? {}, initialContent)
			: (input.metadataJson ?? {});

	return { initialContent, metadataJson };
}

function getInitialWorkspaceContent(type: WorkspaceItemType) {
	switch (getWorkspaceItemRegistryEntry(type).contentKind) {
		case "document":
			return stringifyTiptapDocumentJson(createInitialTiptapDocumentJson());
		case "empty":
			return "";
	}
}
