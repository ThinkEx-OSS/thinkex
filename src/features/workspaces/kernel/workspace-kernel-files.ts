import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	createInitialTiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getWorkspaceItemRegistryEntry } from "#/features/workspaces/workspace-item-registry";

export function getWorkspaceKernelShellPath(input: { id: string; type: WorkspaceItemType }) {
	const extension = getWorkspaceItemRegistryEntry(input.type).extension;
	if (!extension) {
		return `/items/${input.id}`;
	}

	return `/items/${input.id}/content.${extension}`;
}

export function getWorkspaceKernelFileShellPath(input: { itemId: string; extension: string }) {
	return `/items/${input.itemId}/content.${input.extension}`;
}

export function getWorkspaceKernelContentMimeType(type: WorkspaceItemType) {
	return getWorkspaceItemRegistryEntry(type).mimeType;
}

export function getInitialWorkspaceKernelContent(type: WorkspaceItemType) {
	switch (getWorkspaceItemRegistryEntry(type).contentKind) {
		case "document":
			return stringifyTiptapDocumentJson(createInitialTiptapDocumentJson());
		case "flashcard":
			return JSON.stringify({ version: 1, cards: [] }, null, 2);
		case "quiz":
			return JSON.stringify({ version: 1, questions: [] }, null, 2);
		case "empty":
			return "";
	}
}
