import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	createInitialTiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getWorkspaceItemRegistryEntry } from "#/features/workspaces/workspace-item-registry";

export function getInitialWorkspaceKernelContent(type: WorkspaceItemType) {
	switch (getWorkspaceItemRegistryEntry(type).contentKind) {
		case "document":
			return stringifyTiptapDocumentJson(createInitialTiptapDocumentJson());
		case "empty":
			return "";
	}
}
