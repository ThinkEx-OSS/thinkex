import WorkspaceItemPreviewSurface from "#/features/workspaces/components/WorkspaceItemPreviewSurface";
import {
	workspaceItemPreviewControlsLayerClass,
	workspaceItemPreviewStageClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import { WorkspaceItemCardPreviewControls } from "#/features/workspaces/components/workspace-item-card-preview-controls";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

interface WorkspaceItemCardPreviewStageProps {
	item: WorkspaceItem;
	isSelected: boolean;
	onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
}

export function WorkspaceItemCardPreviewStage({
	item,
	isSelected,
	onSelectionChange,
	onMoveItem,
	onRenameItem,
	onDeleteItem,
}: WorkspaceItemCardPreviewStageProps) {
	const { surfaceClassName } = getWorkspaceItemDisplay(item);

	return (
		<div className={cn(workspaceItemPreviewStageClass, surfaceClassName)}>
			<WorkspaceItemPreviewSurface item={item} />
			<div className={workspaceItemPreviewControlsLayerClass}>
				<WorkspaceItemCardPreviewControls
					item={item}
					isSelected={isSelected}
					onSelectionChange={onSelectionChange}
					onMoveItem={onMoveItem}
					onRenameItem={onRenameItem}
					onDeleteItem={onDeleteItem}
				/>
			</div>
		</div>
	);
}
