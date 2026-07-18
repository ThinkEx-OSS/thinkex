import type { WorkspaceItemType } from "#/features/workspaces/contracts";
import {
	createInitialTiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";

export function getWorkspaceKernelShellPath(input: { id: string; type: WorkspaceItemType }) {
	if (input.type === "folder") {
		return `/items/${input.id}`;
	}

	return `/items/${input.id}/content.${getContentExtension(input.type)}`;
}

export function getWorkspaceKernelFileShellPath(input: { itemId: string; extension: string }) {
	return `/items/${input.itemId}/content.${input.extension}`;
}

export function getWorkspaceKernelContentMimeType(type: WorkspaceItemType) {
	switch (type) {
		case "document":
			return "application/json";
		case "file":
			return "text/plain";
		case "folder":
			return "inode/directory";
	}
}

export function getInitialWorkspaceKernelContent(type: WorkspaceItemType) {
	switch (type) {
		case "document":
			return stringifyTiptapDocumentJson(createInitialTiptapDocumentJson());
		case "file":
		case "folder":
			return "";
	}
}

function getContentExtension(type: WorkspaceItemType) {
	switch (type) {
		case "document":
			return "json";
		case "file":
			return "txt";
		case "folder":
			return "";
	}
}
