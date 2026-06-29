import { useState } from "react";

import type { WorkspaceItem } from "#/features/workspaces/model/types";

interface WorkspaceItemActionDialogState {
	renamingItem: WorkspaceItem | null;
	deletingItem: WorkspaceItem | null;
	movingItem: WorkspaceItem | null;
	deleteAlertOpen: boolean;
	moveDialogOpen: boolean;
}

const initialWorkspaceItemActionDialogState: WorkspaceItemActionDialogState = {
	renamingItem: null,
	deletingItem: null,
	movingItem: null,
	deleteAlertOpen: false,
	moveDialogOpen: false,
};

export function useWorkspaceItemActionDialogState() {
	const [state, setState] = useState<WorkspaceItemActionDialogState>(
		initialWorkspaceItemActionDialogState,
	);
	const updateState = (patch: Partial<WorkspaceItemActionDialogState>) =>
		setState((current) => ({ ...current, ...patch }));

	return {
		deleteAlertOpen: state.deleteAlertOpen,
		deletingItem: state.deletingItem,
		moveDialogOpen: state.moveDialogOpen,
		movingItem: state.movingItem,
		renamingItem: state.renamingItem,
		clearDeletingItem: () => updateState({ deletingItem: null, deleteAlertOpen: false }),
		clearMovingItem: () => updateState({ movingItem: null, moveDialogOpen: false }),
		openDeleteAlert: (deletingItem: WorkspaceItem) =>
			updateState({ deletingItem, deleteAlertOpen: true }),
		openMoveDialog: (movingItem: WorkspaceItem) =>
			updateState({ movingItem, moveDialogOpen: true }),
		setDeleteAlertOpen: (deleteAlertOpen: boolean) => updateState({ deleteAlertOpen }),
		setMoveDialogOpen: (moveDialogOpen: boolean) => updateState({ moveDialogOpen }),
		setRenamingItem: (renamingItem: WorkspaceItem | null) => updateState({ renamingItem }),
	};
}
