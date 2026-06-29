import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { WorkspaceItemTreePickerDialog } from "#/features/workspaces/components/WorkspaceItemTreePickerDialog";
import type { WorkspaceSummary } from "#/features/workspaces/contracts";
import { getWorkspaceDisplay } from "#/features/workspaces/model/display";
import { getWorkspaceRootItems } from "#/features/workspaces/model/tree";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import {
	createWorkspaceFolderTreePickerNodes,
	getCommonWorkspaceItemParentId,
	getWorkspaceMoveTargetExcludedFolderIds,
} from "#/features/workspaces/model/workspace-item-tree-picker";
import {
	useCreateWorkspaceItemMutation,
	useMoveWorkspaceItemsMutation,
} from "#/features/workspaces/use-workspace-kernel-items";
import { getErrorMessage } from "#/lib/error-message";

export function MoveWorkspaceItemsDialog({
	open,
	items,
	itemIds,
	workspace,
	showToast = false,
	onOpenChange,
	onMoved,
}: {
	open: boolean;
	items: WorkspaceItem[];
	itemIds: string[];
	workspace: WorkspaceSummary;
	showToast?: boolean;
	onOpenChange: (open: boolean) => void;
	onMoved?: () => void;
}) {
	const createWorkspaceItemMutation = useCreateWorkspaceItemMutation();
	const moveWorkspaceItemsMutation = useMoveWorkspaceItemsMutation();
	const { Icon: WorkspaceIcon, color } = getWorkspaceDisplay(workspace);
	const rootItems = getWorkspaceRootItems(items, itemIds);
	const rootItemIds = rootItems.map((item) => item.id);
	const rootItemIdsKey = rootItemIds.join("\0");
	const currentParentId = getCommonWorkspaceItemParentId(rootItems);
	const [selectedParentDraft, setSelectedParentDraft] = useState<{
		itemIdsKey: string;
		parentId: string | null;
	} | null>(null);
	const selectedParentId =
		selectedParentDraft?.itemIdsKey === rootItemIdsKey
			? selectedParentDraft.parentId
			: (currentParentId ?? null);
	const treeNodes = createWorkspaceFolderTreePickerNodes({
		items,
		rootLabel: workspace.name,
		excludedFolderIds: getWorkspaceMoveTargetExcludedFolderIds({
			items,
			itemIds: rootItemIds,
		}),
	});
	const selectedCurrentParent =
		currentParentId !== undefined && selectedParentId === currentParentId;
	const isCreatePending = createWorkspaceItemMutation.isPending;
	const isMovePending = moveWorkspaceItemsMutation.isPending;
	const isBusy = isCreatePending || isMovePending;
	const canMove = rootItems.length > 0 && !selectedCurrentParent && !isBusy;

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSelectedParentDraft(null);
		}

		onOpenChange(nextOpen);
	};

	return (
		<WorkspaceItemTreePickerDialog
			open={open}
			title={`Move ${rootItems.length === 1 ? "item" : `${rootItems.length} items`}`}
			nodes={treeNodes}
			selectedValue={selectedParentId}
			rootIcon={WorkspaceIcon}
			rootIconClassName={color.text}
			confirmLabel="Move"
			confirmDisabled={!canMove}
			confirming={isBusy}
			footerStart={
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={isBusy}
					onClick={() => {
						const id = crypto.randomUUID();
						const previousParentId = selectedParentId;

						setSelectedParentDraft({
							itemIdsKey: rootItemIdsKey,
							parentId: id,
						});

						createWorkspaceItemMutation.mutate(
							{
								id,
								workspaceId: workspace.id,
								parentId: selectedParentId,
								type: "folder",
							},
							{
								onError: () => {
									setSelectedParentDraft((current) =>
										current?.itemIdsKey === rootItemIdsKey && current.parentId === id
											? {
													itemIdsKey: rootItemIdsKey,
													parentId: previousParentId,
												}
											: current,
									);
								},
							},
						);
					}}
				>
					<FolderPlus className="size-4" />
					New folder
				</Button>
			}
			onOpenChange={handleOpenChange}
			onSelectedValueChange={(parentId) =>
				setSelectedParentDraft({ itemIdsKey: rootItemIdsKey, parentId })
			}
			onConfirm={() => {
				if (!canMove) {
					return;
				}

				const input = {
					workspaceId: workspace.id,
					items: rootItems.map((item) => ({ itemId: item.id })),
					parentId: selectedParentId,
				};
				const movePromise = moveWorkspaceItemsMutation.mutateAsync(input);

				if (showToast) {
					void toast.promise(movePromise, {
						loading: getMoveWorkspaceItemsToastMessage("Moving", rootItems.length, "..."),
						success: getMoveWorkspaceItemsToastMessage("Moved", rootItems.length, "."),
						error: (error) =>
							getErrorMessage(
								error,
								getMoveWorkspaceItemsToastMessage(
									"Unable to move",
									rootItems.length,
									" right now.",
								),
							),
					});
				}

				void movePromise.then(() => {
					setSelectedParentDraft(null);
					onMoved?.();
					handleOpenChange(false);
				});
			}}
		/>
	);
}

function getMoveWorkspaceItemsToastMessage(
	action: "Moving" | "Moved" | "Unable to move",
	itemCount: number,
	suffix: string,
) {
	return `${action} ${itemCount === 1 ? "item" : `${itemCount} items`}${suffix}`;
}
