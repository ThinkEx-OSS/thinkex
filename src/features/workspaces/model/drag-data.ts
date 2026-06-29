import { isRecord, isWorkspaceDragRow } from "./drag-guards";
import {
	WORKSPACE_FOLDER_DRAG_TYPE,
	WORKSPACE_ITEM_DRAG_TYPE,
	type WorkspaceDragData,
	type WorkspaceDragRow,
	type WorkspaceDropTargetData,
} from "./drag-types";

export function createWorkspaceTabDragData(tabId: string): WorkspaceDragData {
	return {
		kind: "workspace-tab",
		tabId,
	};
}

export function createWorkspaceItemDragData(input: {
	itemId: string;
	parentId: string | null;
	row: WorkspaceDragRow;
}): WorkspaceDragData {
	return {
		kind: "workspace-item",
		itemId: input.itemId,
		parentId: input.parentId,
		row: input.row,
	};
}

export function createWorkspaceFolderDropTargetData(input: {
	folderId: string;
	parentId: string | null;
}): WorkspaceDropTargetData {
	return {
		kind: "workspace-folder-drop-target",
		folderId: input.folderId,
		parentId: input.parentId,
	};
}

export function getWorkspaceDragData(data: unknown): WorkspaceDragData | undefined {
	if (!isRecord(data)) {
		return undefined;
	}

	if (data.kind === "workspace-tab" && typeof data.tabId === "string" && data.tabId) {
		return {
			kind: "workspace-tab",
			tabId: data.tabId,
		};
	}

	if (
		data.kind === "workspace-item" &&
		typeof data.itemId === "string" &&
		data.itemId &&
		isWorkspaceDragRow(data.row)
	) {
		return {
			kind: "workspace-item",
			itemId: data.itemId,
			parentId: typeof data.parentId === "string" ? data.parentId : null,
			row: data.row,
		};
	}

	return undefined;
}

export function getWorkspaceDropTargetData(data: unknown): WorkspaceDropTargetData | undefined {
	if (!isRecord(data)) {
		return undefined;
	}

	if (
		data.kind === "workspace-folder-drop-target" &&
		typeof data.folderId === "string" &&
		data.folderId
	) {
		return {
			kind: "workspace-folder-drop-target",
			folderId: data.folderId,
			parentId: typeof data.parentId === "string" ? data.parentId : null,
		};
	}

	return undefined;
}

export function getWorkspaceItemDragRow(type: unknown) {
	if (type === WORKSPACE_FOLDER_DRAG_TYPE) {
		return "folder" as const;
	}

	if (type === WORKSPACE_ITEM_DRAG_TYPE) {
		return "item" as const;
	}

	return undefined;
}
