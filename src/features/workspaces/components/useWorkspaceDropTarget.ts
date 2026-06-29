import { type UseDroppableInput, useDroppable } from "@dnd-kit/react";

import {
	createWorkspaceFolderDropTargetData,
	getWorkspaceFolderDropTargetId,
	WORKSPACE_FOLDER_DRAG_TYPE,
	WORKSPACE_ITEM_DRAG_TYPES,
	type WorkspaceDropTargetData,
} from "#/features/workspaces/model/drag";

type WorkspaceDropTargetBehavior = Pick<
	UseDroppableInput<WorkspaceDropTargetData>,
	"collisionDetector" | "collisionPriority" | "disabled" | "element"
>;

function useWorkspaceDropTarget(
	input: Omit<UseDroppableInput<WorkspaceDropTargetData>, "data"> & {
		data: WorkspaceDropTargetData;
	},
) {
	return useDroppable<WorkspaceDropTargetData>(input);
}

export function useWorkspaceFolderDropTarget(
	input: WorkspaceDropTargetBehavior & {
		folderId: string;
		parentId: string | null;
	},
) {
	return useWorkspaceDropTarget({
		id: getWorkspaceFolderDropTargetId(input.folderId),
		type: WORKSPACE_FOLDER_DRAG_TYPE,
		accept: WORKSPACE_ITEM_DRAG_TYPES,
		collisionDetector: input.collisionDetector,
		collisionPriority: input.collisionPriority,
		disabled: input.disabled,
		element: input.element,
		data: createWorkspaceFolderDropTargetData({
			folderId: input.folderId,
			parentId: input.parentId,
		}),
	});
}
