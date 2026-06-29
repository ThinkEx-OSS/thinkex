import { useDragOperation } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { FolderInput } from "lucide-react";
import type { MouseEvent } from "react";

import { Card, CardHeader, CardTitle } from "#/components/ui/card";
import { ContextMenu, ContextMenuTrigger } from "#/components/ui/context-menu";
import { useWorkspaceFolderDropTarget } from "#/features/workspaces/components/useWorkspaceDropTarget";
import { WorkspaceItemActionsContextMenuContent } from "#/features/workspaces/components/WorkspaceItemActionsMenu";
import {
	workspaceItemCardBaseClass,
	workspaceItemCardHoverClass,
	workspaceItemCardSelectedClass,
	workspaceItemCardUnselectedHoverClass,
} from "#/features/workspaces/components/workspace-item-card-chrome";
import { WorkspaceItemCardFooter } from "#/features/workspaces/components/workspace-item-card-footer";
import { WorkspaceItemCardPreviewStage } from "#/features/workspaces/components/workspace-item-card-preview-stage";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { workspaceItemSortablePlugins } from "#/features/workspaces/components/workspace-sortable-plugins";
import {
	createWorkspaceItemDragData,
	getWorkspaceDragSource,
	getWorkspaceItemDragTypeForRow,
	getWorkspaceItemSortableAccept,
	getWorkspaceItemSortableGroup,
} from "#/features/workspaces/model/drag";
import { getWorkspaceItemMeta } from "#/features/workspaces/model/tree";
import type { WorkspaceItem } from "#/features/workspaces/model/types";
import { cn } from "#/lib/utils";

const WORKSPACE_COLLISION_PRIORITY_HIGH = 3;
const WORKSPACE_COLLISION_PRIORITY_HIGHEST = 4;
const WORKSPACE_COLLISION_TYPE_POINTER_INTERSECTION = 2;

interface WorkspaceItemCardProps {
	item: WorkspaceItem;
	index: number;
	items: WorkspaceItem[];
	isSelected: boolean;
	onOpenItem: (item: WorkspaceItem, options?: { background?: boolean }) => void;
	onMoveItem: (item: WorkspaceItem) => void;
	onRenameItem: (item: WorkspaceItem) => void;
	onDeleteItem: (item: WorkspaceItem) => void;
	onSelectionChange: (item: WorkspaceItem, selected: boolean) => void;
	onElementChange: (itemId: string, element: HTMLElement | null) => void;
}

export default function WorkspaceItemCard({
	item,
	index,
	items,
	isSelected,
	onOpenItem,
	onMoveItem,
	onRenameItem,
	onDeleteItem,
	onSelectionChange,
	onElementChange,
}: WorkspaceItemCardProps) {
	const { capabilities, itemSortableDisabled } = useWorkspaceMutationAccess();
	const { canMutateContent } = capabilities;
	const isFolder = item.type === "folder";
	const row = isFolder ? "folder" : "item";
	const sortableDragType = getWorkspaceItemDragTypeForRow(row);
	const dragOperation = useDragOperation();
	const dragSource = getWorkspaceDragSource(dragOperation.source);
	const folderDropCollisionDetector = ({
		dragOperation,
		droppable,
	}: {
		dragOperation: {
			source?: { id?: unknown } | null;
			position: { current: { x: number; y: number } | null };
		};
		droppable: {
			id: string | number;
			shape?: {
				containsPoint: (point: { x: number; y: number }) => boolean;
				center: { x: number; y: number };
			} | null;
		};
	}) => {
		if (dragOperation.source?.id === item.id) {
			return null;
		}

		const pointer = dragOperation.position.current;

		if (!pointer || !droppable.shape) {
			return null;
		}

		if (!droppable.shape.containsPoint(pointer)) {
			return null;
		}

		const cx = droppable.shape.center.x - pointer.x;
		const cy = droppable.shape.center.y - pointer.y;

		return {
			id: droppable.id,
			value: 1 / Math.sqrt(cx * cx + cy * cy),
			type: WORKSPACE_COLLISION_TYPE_POINTER_INTERSECTION,
			priority: WORKSPACE_COLLISION_PRIORITY_HIGH,
		};
	};
	const {
		isDragging,
		isDropTarget,
		ref: sortableRef,
	} = useSortable({
		id: item.id,
		index,
		type: sortableDragType,
		accept: getWorkspaceItemSortableAccept(row),
		group: getWorkspaceItemSortableGroup({
			workspaceId: item.workspaceId,
			parentId: item.parentId,
			row,
		}),
		disabled: itemSortableDisabled,
		transition: {
			duration: 180,
			easing: "cubic-bezier(0.2, 0, 0, 1)",
			idle: false,
		},
		plugins: workspaceItemSortablePlugins,
		data: createWorkspaceItemDragData({
			itemId: item.id,
			parentId: item.parentId,
			row,
		}),
	});
	const { isDropTarget: isFolderDropTarget, ref: folderDropTargetRef } =
		useWorkspaceFolderDropTarget({
			folderId: item.id,
			parentId: item.parentId,
			disabled: !isFolder || !canMutateContent,
			collisionPriority: WORKSPACE_COLLISION_PRIORITY_HIGHEST,
			collisionDetector: folderDropCollisionDetector,
		});
	const setCardRef = (element: HTMLDivElement | null) => {
		sortableRef(element);
		folderDropTargetRef(isFolder ? element : null);
		onElementChange(item.id, element);
	};
	const showFolderDropAffordance =
		canMutateContent &&
		isFolder &&
		isFolderDropTarget &&
		dragSource?.kind === "workspace-item" &&
		dragSource.itemId !== item.id;
	const isFolderSortingTarget =
		canMutateContent &&
		isFolder &&
		isDropTarget &&
		!isFolderDropTarget &&
		dragSource?.kind === "workspace-item" &&
		dragSource.row === "folder";
	const meta = isFolder ? getWorkspaceItemMeta(item, items) : null;

	const handleOpen = (event: MouseEvent<HTMLElement>) => {
		if (event.shiftKey) {
			event.preventDefault();
			onSelectionChange(item, !isSelected);
			return;
		}

		if (event.metaKey || event.ctrlKey) {
			onOpenItem(item, { background: true });
			return;
		}

		onOpenItem(item);
	};
	const handleRenameClick = (event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		onRenameItem(item);
	};

	const card = (
		<Card
			ref={setCardRef}
			data-workspace-selection-item
			data-selected={isSelected ? "true" : undefined}
			className={cn(
				workspaceItemCardBaseClass,
				workspaceItemCardHoverClass,
				workspaceItemCardUnselectedHoverClass,
				workspaceItemCardSelectedClass,
				isDragging && "opacity-70 shadow-lg",
				canMutateContent &&
					isDropTarget &&
					!showFolderDropAffordance &&
					!isFolderSortingTarget &&
					"bg-muted/60",
				showFolderDropAffordance &&
					"ring-2 ring-foreground/40 ring-offset-2 ring-offset-background",
			)}
			onContextMenu={(event) => event.stopPropagation()}
		>
			<button
				type="button"
				data-workspace-drag-open
				className="absolute inset-0 z-0 cursor-pointer outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				aria-label={`Open ${item.name}`}
				onClick={handleOpen}
			/>
			<WorkspaceItemCardPreviewStage
				item={item}
				isSelected={isSelected}
				onSelectionChange={onSelectionChange}
				onMoveItem={onMoveItem}
				onRenameItem={onRenameItem}
				onDeleteItem={onDeleteItem}
			/>
			{showFolderDropAffordance ? (
				<div
					className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/35 backdrop-blur-[1px]"
					aria-hidden="true"
				>
					<div className="flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-sm">
						<FolderInput className="size-4 text-foreground" />
						<span>Move here</span>
					</div>
				</div>
			) : null}
			<CardHeader className="pointer-events-none relative z-10 shrink-0 gap-1 px-3 py-2">
				<CardTitle className="min-w-0">
					{canMutateContent ? (
						<button
							type="button"
							className="pointer-events-auto relative z-20 block max-w-full cursor-text truncate rounded-sm text-left underline-offset-4 outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							aria-label={`Rename ${item.name}`}
							onClick={handleRenameClick}
						>
							{item.name}
						</button>
					) : (
						<span className="relative z-20 block max-w-full truncate">{item.name}</span>
					)}
				</CardTitle>
				{isFolder ? (
					meta ? (
						<p className="text-xs text-muted-foreground">{meta}</p>
					) : null
				) : (
					<WorkspaceItemCardFooter item={item} />
				)}
			</CardHeader>
		</Card>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger render={card} />
			<WorkspaceItemActionsContextMenuContent
				item={item}
				onMoveItem={onMoveItem}
				onRenameItem={onRenameItem}
				onDeleteItem={onDeleteItem}
			/>
		</ContextMenu>
	);
}
