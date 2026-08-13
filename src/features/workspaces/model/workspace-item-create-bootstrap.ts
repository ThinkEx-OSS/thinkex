import {
	type JsonValue,
	type WorkspaceItemType,
	getWorkspaceItemContentKind,
} from "#/features/workspaces/contracts";
import { prepareDocumentItemMetadata } from "#/features/workspaces/documents/document-item-content";
import {
	createInitialTiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";

/** Content and metadata shared by persistence writes and optimistic UI. */
export function buildWorkspaceItemCreateBootstrap(input: {
	type: WorkspaceItemType;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
}) {
	const contentKind = getWorkspaceItemContentKind(input.type);
	const initialContent =
		input.initialContent ??
		(contentKind === "document"
			? stringifyTiptapDocumentJson(createInitialTiptapDocumentJson())
			: "");
	const metadataJson =
		contentKind === "document"
			? prepareDocumentItemMetadata(input.metadataJson ?? {}, initialContent)
			: (input.metadataJson ?? {});

	return { initialContent, metadataJson };
}
