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
import {
	parseFlashcardSetContent,
	stringifyFlashcardSetContent,
} from "#/features/workspaces/flashcards/flashcard-content";

/** Content and metadata shared by persistence writes and optimistic UI. */
export function buildWorkspaceItemCreateBootstrap(input: {
	type: WorkspaceItemType;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
}) {
	const contentKind = getWorkspaceItemContentKind(input.type);
	const initialContent =
		contentKind === "document"
			? input.initialContent?.trim()
				? input.initialContent
				: stringifyTiptapDocumentJson(createInitialTiptapDocumentJson())
			: input.type === "flashcard"
				? stringifyFlashcardSetContent(parseFlashcardSetContent(input.initialContent ?? ""))
				: (input.initialContent ?? "");
	const metadataJson =
		contentKind === "document"
			? prepareDocumentItemMetadata(input.metadataJson ?? {}, initialContent)
			: (input.metadataJson ?? {});

	return { initialContent, metadataJson };
}
