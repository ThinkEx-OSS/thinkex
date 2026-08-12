import { type WorkspaceItem, isWorkspaceItemContainer } from "#/features/workspaces/contracts";

export type WorkspaceViewMode = "root" | "folder" | "item";

export function getWorkspaceViewMode(activeItem?: WorkspaceItem): WorkspaceViewMode {
	if (!activeItem) {
		return "root";
	}

	if (isWorkspaceItemContainer(activeItem.type)) {
		return "folder";
	}

	return "item";
}

export function isWorkspaceItemView(activeItem?: WorkspaceItem): activeItem is WorkspaceItem {
	return getWorkspaceViewMode(activeItem) === "item";
}

export function getWorkspaceBrowseParentId(activeItem?: WorkspaceItem) {
	return activeItem && isWorkspaceItemContainer(activeItem.type) ? activeItem.id : null;
}

export function resolveWorkspaceUploadDestination(activeItem?: WorkspaceItem) {
	if (!activeItem) {
		return null;
	}

	if (isWorkspaceItemContainer(activeItem.type)) {
		return activeItem.id;
	}

	return activeItem.parentId ?? null;
}
