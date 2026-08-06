import { useMemo, useState } from "react";

import type { WorkspaceItem } from "#/features/workspaces/model/types";

interface WorkspaceItemActionDialogState {
	renamingItemId: string | null;
	deletingItemId: string | null;
	movingItemId: string | null;
	deleteAlertOpen: boolean;
	moveDialogOpen: boolean;
}

const initialWorkspaceItemActionDialogState: WorkspaceItemActionDialogState = {
	renamingItemId: null,
	deletingItemId: null,
	movingItemId: null,
	deleteAlertOpen: false,
	moveDialogOpen: false,
};

export function useWorkspaceItemActionDialogState(items: WorkspaceItem[]) {
	const [state, setState] = useState<WorkspaceItemActionDialogState>(
		initialWorkspaceItemActionDialogState,
	);
	const updateState = (patch: Partial<WorkspaceItemActionDialogState>) =>
		setState((current) => ({ ...current, ...patch }));
	const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

	return {
		deleteAlertOpen: state.deleteAlertOpen,
		deletingItem: state.deletingItemId ? (itemsById.get(state.deletingItemId) ?? null) : null,
		moveDialogOpen: state.moveDialogOpen,
		movingItem: state.movingItemId ? (itemsById.get(state.movingItemId) ?? null) : null,
		renamingItem: state.renamingItemId ? (itemsById.get(state.renamingItemId) ?? null) : null,
		clearDeletingItem: () => updateState({ deletingItemId: null, deleteAlertOpen: false }),
		clearMovingItem: () => updateState({ movingItemId: null, moveDialogOpen: false }),
		openDeleteAlert: (deletingItem: WorkspaceItem) =>
			updateState({ deletingItemId: deletingItem.id, deleteAlertOpen: true }),
		openMoveDialog: (movingItem: WorkspaceItem) =>
			updateState({ movingItemId: movingItem.id, moveDialogOpen: true }),
		setDeleteAlertOpen: (deleteAlertOpen: boolean) => updateState({ deleteAlertOpen }),
		setMoveDialogOpen: (moveDialogOpen: boolean) => updateState({ moveDialogOpen }),
		setRenamingItem: (renamingItem: WorkspaceItem | null) =>
			updateState({ renamingItemId: renamingItem?.id ?? null }),
	};
}
