import { CheckIcon, EllipsisVertical } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";

import { Button } from "#/components/ui/button";
import WorkspaceItemActionsMenu from "#/features/workspaces/components/WorkspaceItemActionsMenu";
import {
	workspaceItemPreviewControlClass,
	workspaceItemPreviewControlOverlayClass,
	workspaceItemPreviewControlRowClass,
	workspaceItemPreviewControlSelectedClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

function ItemCardPreviewButton({
	selected,
	className,
	...props
}: ComponentProps<typeof Button> & { selected?: boolean }) {
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			data-selected={selected ? "true" : undefined}
			className={cn(
				workspaceItemPreviewControlClass,
				workspaceItemPreviewControlOverlayClass,
				selected && workspaceItemPreviewControlSelectedClass,
				className,
			)}
			{...props}
		/>
	);
}

interface WorkspaceItemCardPreviewControlsProps {
	item: WorkspaceItem;
	isSelected: boolean;
	onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
}

export function WorkspaceItemCardPreviewControls({
	item,
	isSelected,
	onSelectionChange,
	onMoveItem,
	onRenameItem,
	onDeleteItem,
}: WorkspaceItemCardPreviewControlsProps) {
	const handleSelectionClick = (event: MouseEvent<HTMLElement>) => {
		event.stopPropagation();
		onSelectionChange(item, !isSelected);
	};

	return (
		<div className={workspaceItemPreviewControlRowClass}>
			<ItemCardPreviewButton
				aria-label={`Select ${item.name}`}
				aria-pressed={isSelected}
				selected={isSelected}
				onClick={handleSelectionClick}
			>
				<CheckIcon
					className={cn(
						"size-3.5 transition-opacity",
						isSelected
							? "opacity-100"
							: "opacity-0 group-hover/button:opacity-55 dark:group-hover/button:opacity-65",
					)}
					aria-hidden="true"
				/>
			</ItemCardPreviewButton>
			<div aria-hidden="true" className="h-full flex-1" />
			<WorkspaceItemActionsMenu
				item={item}
				trigger={
					<ItemCardPreviewButton
						aria-label={`Open actions for ${item.name}`}
						onClick={(event) => event.stopPropagation()}
					>
						<EllipsisVertical className="size-3.5" aria-hidden="true" />
					</ItemCardPreviewButton>
				}
				onMoveItem={onMoveItem}
				onRenameItem={onRenameItem}
				onDeleteItem={onDeleteItem}
			/>
		</div>
	);
}
