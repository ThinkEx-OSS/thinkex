import {
	getWorkspaceDragData,
	getWorkspaceDropTargetData,
	getWorkspaceItemDragRow,
} from "./drag-data";
import {
	getWorkspaceFolderDropTargetFolderId,
	getWorkspaceFolderDropTargetId,
	getWorkspaceSplitDropTargetInput,
} from "./drag-target-ids";
import {
	WORKSPACE_FOLDER_DRAG_TYPE,
	WORKSPACE_ITEM_DRAG_TYPE,
	WORKSPACE_TAB_DRAG_TYPE,
	type WorkspaceDragEntity,
	type WorkspaceDragRow,
	type WorkspaceDragSource,
	type WorkspaceDropTarget,
} from "./drag-types";

function dragEntityIdToString(id: unknown): string {
	if (typeof id === "string" || typeof id === "number" || typeof id === "bigint") {
		return String(id);
	}

	return "";
}

export { getWorkspaceFolderDropTargetId };

export function getWorkspaceDragSource(
	source: WorkspaceDragEntity | null | undefined,
): WorkspaceDragSource | undefined {
	if (!source || source.id == null) {
		return undefined;
	}

	const data = getWorkspaceDragData(source.data);

	if (data?.kind === "workspace-tab") {
		return {
			kind: "tab",
			tabId: data.tabId,
		};
	}

	if (data?.kind === "workspace-item") {
		return {
			kind: "workspace-item",
			itemId: data.itemId,
			parentId: data.parentId,
			row: data.row,
		};
	}

	if (source.type === WORKSPACE_TAB_DRAG_TYPE) {
		return {
			kind: "tab",
			tabId: dragEntityIdToString(source.id),
		};
	}

	const row = getWorkspaceItemDragRow(source.type);

	if (!row) {
		return undefined;
	}

	return {
		kind: "workspace-item",
		itemId: dragEntityIdToString(source.id),
		row,
	};
}

export function getWorkspaceDropTarget(
	target: WorkspaceDragEntity | null | undefined,
): WorkspaceDropTarget | undefined {
	if (!target || target.id == null) {
		return undefined;
	}

	const dragData = getWorkspaceDragData(target.data);

	if (dragData?.kind === "workspace-tab") {
		return {
			kind: "tab",
			tabId: dragData.tabId,
		};
	}

	if (dragData?.kind === "workspace-item") {
		return {
			kind: "workspace-item",
			itemId: dragData.itemId,
			parentId: dragData.parentId,
			row: dragData.row,
		};
	}

	const dropTargetData = getWorkspaceDropTargetData(target.data);

	if (dropTargetData?.kind === "workspace-folder-drop-target") {
		return {
			kind: "workspace-folder",
			folderId: dropTargetData.folderId,
			parentId: dropTargetData.parentId,
		};
	}

	if (dropTargetData?.kind === "workspace-pane-split-drop-target") {
		return {
			kind: "pane-split",
			paneId: dropTargetData.paneId,
			side: dropTargetData.side,
		};
	}

	if (target.type === WORKSPACE_TAB_DRAG_TYPE) {
		return {
			kind: "tab",
			tabId: dragEntityIdToString(target.id),
		};
	}

	const folderId = getWorkspaceFolderDropTargetFolderId(target.id);

	if (folderId) {
		return {
			kind: "workspace-folder",
			folderId,
		};
	}

	const splitInput = getWorkspaceSplitDropTargetInput(target.id);

	if (splitInput) {
		return {
			kind: "pane-split",
			paneId: splitInput.paneId,
			side: splitInput.side,
		};
	}

	const row = getWorkspaceItemDragRow(target.type);

	if (!row) {
		return undefined;
	}

	return {
		kind: "workspace-item",
		itemId: dragEntityIdToString(target.id),
		row,
	};
}

export function getWorkspaceItemSortableGroup(input: {
	workspaceId: string;
	parentId: string | null;
	row: "folder" | "item";
}) {
	return ["workspace-items", input.workspaceId, input.parentId ?? "root", input.row].join(":");
}

export function getWorkspaceItemDragTypeForRow(row: WorkspaceDragRow) {
	return row === "folder" ? WORKSPACE_FOLDER_DRAG_TYPE : WORKSPACE_ITEM_DRAG_TYPE;
}

export function getWorkspaceItemSortableAccept(row: WorkspaceDragRow) {
	return getWorkspaceItemDragTypeForRow(row);
}
