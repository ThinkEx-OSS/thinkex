import { isWorkspaceSplitDropSide } from "#/features/workspaces/model/drag-guards";
import type { WorkspaceSplitDropSide } from "#/features/workspaces/model/drag-types";

const WORKSPACE_FOLDER_DROP_TARGET_ID_PREFIX = "workspace-folder-drop:";
const WORKSPACE_SPLIT_DROP_TARGET_ID_PREFIX = "workspace-split-drop:";

export function getWorkspaceFolderDropTargetId(folderId: string) {
	return `${WORKSPACE_FOLDER_DROP_TARGET_ID_PREFIX}${folderId}`;
}

export function getWorkspaceFolderDropTargetFolderId(id: unknown) {
	if (typeof id !== "string") {
		return undefined;
	}

	if (!id.startsWith(WORKSPACE_FOLDER_DROP_TARGET_ID_PREFIX)) {
		return undefined;
	}

	const folderId = id.slice(WORKSPACE_FOLDER_DROP_TARGET_ID_PREFIX.length);

	return folderId || undefined;
}

export function getWorkspaceSplitDropTargetInput(id: unknown):
	| {
			paneId: string;
			side: WorkspaceSplitDropSide;
	  }
	| undefined {
	if (typeof id !== "string") {
		return undefined;
	}

	if (!id.startsWith(WORKSPACE_SPLIT_DROP_TARGET_ID_PREFIX)) {
		return undefined;
	}

	const value = id.slice(WORKSPACE_SPLIT_DROP_TARGET_ID_PREFIX.length);
	const sideSeparatorIndex = value.lastIndexOf(":");

	if (sideSeparatorIndex <= 0) {
		return undefined;
	}

	const paneId = decodeWorkspaceDropTargetSegment(value.slice(0, sideSeparatorIndex));
	const side = value.slice(sideSeparatorIndex + 1);

	if (!paneId || !isWorkspaceSplitDropSide(side)) {
		return undefined;
	}

	return {
		paneId,
		side,
	};
}

function decodeWorkspaceDropTargetSegment(value: string) {
	try {
		return decodeURIComponent(value);
	} catch {
		return undefined;
	}
}
